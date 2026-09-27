import { MAP } from "../config/balance";
import { SAVE_VERSION, type SaveData } from "./types";

/**
 * セーブデータのバージョン移行。
 *
 * 将来データ構造を変えたときは
 *   1. types.ts の SAVE_VERSION を +1（新しい SaveDataVn を定義）
 *   2. ここの STEPS に「n → n+1」の変換を1つ足す
 * だけで、古いセーブが読めなくなることを防げる。
 * STEPS は素の JSON を受け取り、素の JSON を返す（型は移行の途中で不定なので unknown 扱い）。
 */

/** マイグレーション途中の生データ。 */
type RawSave = Record<string, unknown>;

/** version n のデータを n+1 へ引き上げる関数。 */
type MigrationStep = (data: RawSave) => RawSave;

const STEPS: Record<number, MigrationStep> = {
  /**
   * v1 → v2：設備（プール／スタジオ／筋トレルーム）と、月1回のイベント管理を追加。
   * v1 の世界には「最初の6レーンプール」が暗黙にあったので、それを1つ持たせる
   * （これが無いとスクールの練習枠が0になり、誰も入会できなくなる）。
   */
  1: (d) => {
    const game = { ...(d.game as RawSave) };
    game.equipment = [{ id: 1, kind: "pool6" }];
    game.nextEquipmentId = 2;
    game.heldThisMonth = [];
    return { ...d, version: 2, game };
  },

  /**
   * v2 → v3：チュートリアルの進行位置と、月次の入会カウンタを追加。
   * 既存データは「もう遊べている人」なのでチュートリアルは出さない（-1）。
   */
  2: (d) => {
    const game = { ...(d.game as RawSave) };
    game.tutorialStep = -1;
    game.monthEnrolled = 0;
    game.monthTurnedAway = 0;
    return { ...d, version: 3, game };
  },

  /**
   * v3 → v4：休養の予約制／全体練習／アイテム／欲求／格（8段階）を追加。
   *
   * ここで大事なのは planMode。v4 の新規選手は既定が "class"（全体練習に従う）だが、
   * v3 までの世界には全体練習が無く、全員が自分の plan で練習していた。
   * そのまま "class" にすると既存プレイヤーの練習内容が黙って変わってしまうので、
   * 既存の選手は全員 "self"（個人指定）として引き継ぐ。
   * 全体練習に乗せたい場合は、あとから画面で「全体練習に戻す」を押せばよい。
   *
   * 格は成績で決まるので、ここでは 1（どこにでもいる水泳生徒）から始める。
   * 次の月替わりの記録会で全員のタイムが計測され、実力に見合った格に落ち着く。
   */
  3: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({
      ...s,
      planMode: "self", // 既存の練習内容をそのまま維持する
      restPending: 0,
      resting: false,
      recoveryNeed: 0,
      achievePoints: 0,
      bestTimeScore: 0,
      bestTimeSec: 0,
      bestTimeEvent: null,
      rankTier: 1,
      wins: 0,
    }));
    game.items = { stretchMat: 0, jumpRope: 0, stretchPole: 0 };
    game.classPlans = {}; // 全体指定なし＝個人指定がそのまま効く
    return { ...d, version: 4, game };
  },

  /**
   * v4 → v5：クラブの格（大会実績＋人気度）と、アイテムの配置を追加。
   *
   * クラブの格は「無名のスイミングクラブ」から始めるが、スコアは人気度と
   * 通算優勝からも計算されるので、既存の強いクラブは最初の月替わりで
   * 実力どおりの格まで一気に上がる（そのとき演出も出る）。
   * アイテムの配置は空でよい（読み込み時に所持数ぶんの既定位置が入る）。
   */
  4: (d) => {
    const game = { ...(d.game as RawSave) };
    game.clubAchievement = 0;
    game.clubRankTier = 1;
    game.itemPlacements = {};
    return { ...d, version: 5, game };
  },

  /**
   * v5 → v6：会議室と研究、コーチの「担当時間外の過ごし方」を追加。
   * あわせて、アイテムの置き場所がスタジオの中に変わった。
   *
   * v5 までは館内のどこにでも置けたので、スタジオを持っていないプレイヤーが
   * 突然アイテムを使えなくなってしまう。それを避けるため、
   * 練習・回復に使うアイテムを持っているのにスタジオが無い場合は、
   * スタジオを1つ無料で付けてから移行する（買ったものが無駄にならないように）。
   * 置き場所自体はスタジオ内の既定位置に振り直す。
   */
  5: (d) => {
    const game = { ...(d.game as RawSave) };
    game.research = null;
    game.doneResearch = [];

    const coaches = Array.isArray(game.coaches) ? (game.coaches as RawSave[]) : [];
    game.coaches = coaches.map((c) => ({ ...c, duty: "idle" }));

    const items = (game.items ?? {}) as Record<string, number>;
    const gearCount =
      (items.stretchMat ?? 0) + (items.jumpRope ?? 0) + (items.stretchPole ?? 0);
    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    const hasStudio = equipment.some((e) => e && e.kind === "studio");
    if (gearCount > 0 && !hasStudio) {
      const nextId = typeof game.nextEquipmentId === "number" ? game.nextEquipmentId : equipment.length + 1;
      game.equipment = [...equipment, { id: nextId, kind: "studio" }];
      game.nextEquipmentId = nextId + 1;
    }
    // 置き場所はスタジオ内の既定位置に振り直す（読み込み時に所持数ぶん自動で埋まる）
    game.itemPlacements = {};

    return { ...d, version: 6, game };
  },

  /**
   * v6 → v7：設備を「部屋（箱）」と「器具（中身）」の二段構えに整理。
   *
   * サウナ・マッサージ器は、これまで単体の設備として置いていたが、
   * これからは「マッサージエリアという部屋の中に置く器具」になる。
   * そこで
   *   1. equipment から sauna / massage を取り除き、items の所持数に移す
   *   2. 移した器具が入るだけの「マッサージエリア」を無料で建てる
   *      （買ってあった設備が使えなくならないように）
   * を行う。置き場所は部屋の中の既定位置に振り直す。
   */
  6: (d) => {
    const game = { ...(d.game as RawSave) };
    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];

    let sauna = 0;
    let massage = 0;
    const kept: RawSave[] = [];
    for (const e of equipment) {
      if (!e) continue;
      if (e.kind === "sauna") sauna++;
      else if (e.kind === "massage") massage++;
      else kept.push(e);
    }

    const items = { ...((game.items ?? {}) as Record<string, number>) };
    items.sauna = (items.sauna ?? 0) + sauna;
    items.massage = (items.massage ?? 0) + massage;
    game.items = items;

    // 移した器具が全部入るだけのマッサージエリアを用意する（サウナは2枠ぶん）
    const needSlots = sauna * 2 + massage;
    const rooms = Math.min(4, Math.ceil(needSlots / 3));
    let nextId = typeof game.nextEquipmentId === "number" ? game.nextEquipmentId : kept.length + 1;
    for (let i = 0; i < rooms; i++) kept.push({ id: nextId++, kind: "recovery" });

    game.equipment = kept;
    game.nextEquipmentId = nextId;
    game.itemPlacements = {}; // 置き場所は部屋の中に振り直す

    return { ...d, version: 7, game };
  },

  /**
   * v7 → v8：コーチの格と専門種目／合宿のタイプ化・高地の下山タイミング／
   * 専門スタッフ（栄養士・ドクター）と、そのための部屋（食堂・ドクタールーム）を追加。
   *
   * ここで気をつけているのは3点。
   *  1. コーチの specialty（得意泳法）は v7 には無い。null のままにせず、
   *     読み込み側（serialize.ts）が決定的に振り直せるよう未設定のまま渡す。
   *     格（quality 1〜5）はそのまま「見習い〜レジェンド」に読み替わるので変換不要。
   *  2. 選手の injuryDays / altitude は「健康・高地効果なし」で始める。
   *     過去にフォームが落ちた分は既にステータスへ反映済みなので、
   *     ここでケガを付け直すと二重の罰になってしまう。
   *  3. dayCount は 0 から数え直す。高地の下山日は dayCount 基準の相対値で、
   *     v7 の世界には高地合宿そのものが無いため、ズレようがない。
   * 専門スタッフは0人スタート（部屋を建てて雇うところから始めてもらう）。
   */
  7: (d) => {
    const game = { ...(d.game as RawSave) };

    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, injuryDays: 0, altitude: null }));

    game.staff = [];
    game.nextStaffId = 1;
    game.dayCount = 0;
    game.scoutBoost = 0;

    return { ...d, version: 8, game };
  },

  /**
   * v8 → v9：施設をマス目マップに載せ替え、部屋を自由配置できるようにした。
   * あわせて時間割（プール×コマ）・寮・一般客・幼少期フォームが入る。
   *
   * v8 までの世界には「決まったかたちの建物」があり、部屋には位置が無かった。
   * そのままだと全部の部屋が未配置（＝使えない）になってしまうので、
   *   1. 入口・受付・更衣室が無いプレイヤーには無料で付ける
   *      （v8 の建物にはどれも最初から在ったため。無いと誰も入って来られない）
   *   2. 持っている部屋を全部マップへ並べ直し、道で入口まで繋ぐ
   *   3. 1つ目のプールに、v8 と同じ流れの時間割を入れる
   * を行う。並べ方はあくまで初期案なので、あとから建設モードで自由に動かせる。
   *
   * 幼少期フォーム（youthForm）は 0＝記録なしで始める。
   * 過去に遡って「幼いころのフォーム」を作ると、既存の選手の伸びが
   * 突然変わってしまうため、これから育てる子から効くようにしている。
   */
  8: (d) => {
    const game = { ...(d.game as RawSave) };

    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, youthForm: 0, inDorm: false }));

    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    let nextId = typeof game.nextEquipmentId === "number" ? game.nextEquipmentId : equipment.length + 1;
    const kept = equipment.filter((e) => !!e);
    // v8 の建物に最初から在った部屋を補う（無いと入口が無く、誰も入れない）。
    // 受付は廃止したので補わない（古いセーブに入っていても読み込み時に捨てられる）。
    for (const kind of ["entrance", "locker"]) {
      if (!kept.some((e) => e.kind === kind)) kept.push({ id: nextId++, kind });
    }
    // プールが1つも無いセーブ（あり得ないが防御）にも6レーンを1つ
    if (!kept.some((e) => e.kind === "pool6" || e.kind === "pool8")) {
      kept.push({ id: nextId++, kind: "pool6" });
    }
    // 位置は未設定にしておく。実際の配置と道は読み込み時（serialize.ts）が作る。
    game.equipment = kept.map((e) => ({ ...e, gx: null, gy: null }));
    game.nextEquipmentId = nextId;
    game.roads = [];
    game.mapCols = 0; // 0＝寸法不明。読み込み側が今の config で並べ直す
    game.mapRows = 0;
    game.timetable = []; // 空＝読み込み時に既定の時間割が入る
    game.guestIncome = 0;
    game.lastScoutMonth = -99;

    return { ...d, version: 9, game };
  },

  /**
   * v9 → v10：プロ選手が「専属コーチ」を指名できるようになった。
   * 既存の選手は指名なし（＝これまでどおりクラスの監督が見る）で始める。
   */
  9: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, personalCoachId: null }));
    return { ...d, version: 10, game };
  },

  /**
   * v10 → v11：クリニックで「受診（リハビリ）」ができるようになった。
   * 既存の選手はリハビリに入っていない状態で始める。
   */
  10: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, inRehab: false }));
    return { ...d, version: 11, game };
  },

  /**
   * v11 → v12：乱数の状態と、自動イベントの残り時間を保存するようになった。
   * 古いセーブには無いので、保存時刻から種を作って始める
   * （どの端末でも同じ結果になる必要はなく、「読み込むたびに変わらない」ことが大事）。
   */
  11: (d) => {
    const game = { ...(d.game as RawSave) };
    const savedAt = typeof d.savedAt === "number" ? d.savedAt : 1;
    game.rngState = (Math.floor(savedAt) % 2147483647) || 0x9e3779b9;
    game.enrollTimer = 0;
    game.flavorTimer = 0;
    return { ...d, version: 12, game };
  },

  /**
   * v12 → v13：サウナが「マッサージエリアに置く器具」から「どこにでも建てられる部屋」になった。
   * 持っていたサウナの器具を、同じ数だけサウナの部屋に置き換える（買ったものが消えないように）。
   * キャンペーンの「打った回数」も新設（0から）。
   */
  12: (d) => {
    const game = { ...(d.game as RawSave) };
    const items = { ...((game.items ?? {}) as Record<string, number>) };
    const sauna = Math.max(0, Math.floor(items.sauna ?? 0));
    if (sauna > 0) {
      delete items.sauna;
      const equipment = Array.isArray(game.equipment) ? [...(game.equipment as RawSave[])] : [];
      let nextId = typeof game.nextEquipmentId === "number" ? game.nextEquipmentId : equipment.length + 1;
      for (let i = 0; i < sauna; i++) equipment.push({ id: nextId++, kind: "sauna", gx: null, gy: null });
      game.equipment = equipment;
      game.nextEquipmentId = nextId;
      // 置き場所は振り直す（部屋になったのでマッサージエリアの枠は使わない）
      const placements = { ...((game.itemPlacements ?? {}) as Record<string, number[]>) };
      delete placements.sauna;
      game.itemPlacements = placements;
    }
    game.items = items;
    game.campaignRepeats = {};
    return { ...d, version: 13, game };
  },

  /**
   * v13 → v14：敷地の拡張（買って広げる土地）を追加。
   *
   * v13 までは敷地が最初から最大（24×24マス）だったので、
   * 既存のセーブは「最大まで買ってある」状態にする。
   * ここを 0 にすると、すでに建っている部屋や敷いた道が敷地の外に出て、
   * 全部「行けない部屋」になってしまう。
   */
  13: (d) => {
    const game = { ...(d.game as RawSave) };
    game.landSteps = MAP.maxLandSteps;
    game.specialUsed = [];
    return { ...d, version: 14, game };
  },

  /**
   * v14 → v15：コーチの指導力と、レベル制の研究を追加。
   *
   *  ・完了済みの研究（doneResearch）は **すべて Lv1** として引き継ぐ。
   *    効果はレベルに比例するので、これで v14 と同じ効き目になる。
   *  ・進行中だった研究は、そのまま「Lv(現在+1) を目指すプロジェクト」に読み替える。
   *    ただし v15 は会議室と4人1組が要るので、班は空で入れておき、
   *    読み込み後の syncResearch / UI で組み直してもらう。
   *  ・指導力は格から見積もる（v14 の世界で育ててきたぶんは分からないので、素の初期値）。
   */
  14: (d) => {
    const game = { ...(d.game as RawSave) };
    const levels: Record<string, number> = {};
    const done = Array.isArray(game.doneResearch) ? (game.doneResearch as unknown[]) : [];
    for (const id of done) {
      if (typeof id === "string") levels[id] = 1;
    }
    const active = game.research as { id?: unknown; progress?: unknown } | null | undefined;
    const projects: RawSave[] = [];
    if (active && typeof active.id === "string") {
      projects.push({
        roomId: -1, // 部屋は読み込み時に割り当て直す（syncResearch）
        id: active.id,
        progress: typeof active.progress === "number" ? active.progress : 0,
        coachIds: [],
        targetLevel: (levels[active.id] ?? 0) + 1,
      });
    }
    game.researchLevels = levels;
    game.researchProjects = projects;
    delete game.research;
    delete game.doneResearch;

    const coaches = Array.isArray(game.coaches) ? (game.coaches as RawSave[]) : [];
    game.coaches = coaches.map((c) => ({
      ...c,
      teaching: typeof c.teaching === "number" ? c.teaching : Math.round((Number(c.quality) || 1) * 7),
    }));
    return { ...d, version: 15, game };
  },

  /**
   * v15 → v16：敷地の拡張を「初期の12倍まで・5段階」にしたのに合わせて、
   * マップのマス目を **26×26 → 37×37** に広げた。
   *
   * 敷地（建てられる範囲）はマップの**中央ぞろえ**なので、
   * マップが大きくなると同じ (gx,gy) が別の場所を指してしまう。
   * そこで、部屋の座標と道のマス番号を「古い敷地の左上」から
   * 「新しい敷地の左上」までの差だけ平行移動する。
   *
   * 段数も、面積が減らないように読み替える（古い一辺 ≦ 新しい一辺 になる段へ）。
   *   旧 12マス角(段0) → 新 15マス角(段1)
   *   旧 16マス角(段1) → 新 20マス角(段2)
   *   旧 20マス角(段2) → 新 20マス角(段2)
   *   旧 24マス角(段3) → 新 25マス角(段3)
   * 数値をここに直書きしているのは、**config を将来また変えても移行が壊れないように**するため。
   */
  15: (d) => {
    const game = { ...(d.game as RawSave) };
    // 幅は「そのセーブが書かれたときのマップの列数」を使う（既定は v15 までの 26）。
    // 決め打ちにすると、別の幅で書かれたデータを読んだときに道の位置がずれる。
    const OLD_COLS = Math.max(1, Math.round(Number(game.mapCols) || 26));
    const OLD_RING = 1;
    const oldInner = (st: number): number => Math.min(OLD_COLS - OLD_RING * 2, 12 + 4 * st);
    const oldX0 = (st: number): number => Math.floor((OLD_COLS - oldInner(st)) / 2);
    const newInner = (st: number): number =>
      Math.min(MAP.cols - MAP.roadRing * 2, MAP.baseInner + MAP.expandStep * st);
    const newX0 = (st: number): number => Math.floor((MAP.cols - newInner(st)) / 2);

    const oldSteps = Math.max(0, Math.min(3, Math.floor(Number(game.landSteps) || 0)));
    let steps = 0;
    while (steps < MAP.maxLandSteps && newInner(steps) < oldInner(oldSteps)) steps++;
    const shift = newX0(steps) - oldX0(oldSteps);

    // 部屋（未配置＝gx/gy が null のものはそのまま）
    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    game.equipment = equipment.map((e) => ({
      ...e,
      gx: typeof e.gx === "number" ? e.gx + shift : e.gx,
      gy: typeof e.gy === "number" ? e.gy + shift : e.gy,
    }));

    // 道（マス番号 → (gx,gy) に戻して、ずらしてから新しい番号へ）
    const roads = Array.isArray(game.roads) ? (game.roads as unknown[]) : [];
    const moved: number[] = [];
    for (const raw of roads) {
      const i = Math.round(Number(raw));
      if (!Number.isFinite(i) || i < 0) continue;
      const gx = (i % OLD_COLS) + shift;
      const gy = Math.floor(i / OLD_COLS) + shift;
      if (gx < 0 || gy < 0 || gx >= MAP.cols || gy >= MAP.rows) continue;
      moved.push(gy * MAP.cols + gx);
    }
    game.roads = moved;
    game.mapCols = MAP.cols;
    game.mapRows = MAP.rows;
    game.landSteps = steps;
    return { ...d, version: 16, game };
  },

  /**
   * v16 → v17：**器具を部屋に同梱**（器具の個別購入・配置を廃止）。
   *
   * それまでは「部屋を買う → 器具を1個ずつ買って部屋の枠に置く」だった。
   * v17 からは部屋がグレード（小・中・大）を持ち、グレードが中身（器具）を決める。
   *
   * 【移行の考え方】払った額を無駄にしないため、**持っていた器具の数を
   * その部屋のグレードに読み替える**。器具を揃えていた人ほど高いグレードで始まる。
   *   持っていた器具 0〜1個 → 小 ／ 2〜3個 → 中 ／ 4個以上 → 大
   * 部屋の中の器具は持ち物から外す。外構の装飾はそのまま残す
   *（買って置く仕組みが続くのは外構だけ）。
   */
  16: (d) => {
    const game = { ...(d.game as RawSave) };
    const items = (game.items ?? {}) as Record<string, unknown>;
    const countOf = (keys: readonly string[]): number =>
      keys.reduce((n, k) => n + Math.max(0, Math.floor(Number(items[k]) || 0)), 0);
    const gradeFor = (n: number): number => (n >= 4 ? 3 : n >= 2 ? 2 : 1);
    const byRoom: Record<string, number> = {
      gym: gradeFor(countOf(["dumbbell", "barbell", "benchPress", "smithMachine", "powerRack"])),
      studio: gradeFor(countOf(["stretchMat", "jumpRope", "stretchPole"])),
      recovery: gradeFor(countOf(["massage"])),
    };
    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    game.equipment = equipment.map((e) => ({ ...e, grade: byRoom[String(e.kind)] ?? 1 }));

    const keepOutdoor = ["sign", "flowerbed", "bikeRack", "bench", "banner", "streetLight"];
    const place = (game.itemPlacements ?? {}) as Record<string, unknown>;
    const nextItems: Record<string, unknown> = {};
    const nextPlace: Record<string, unknown> = {};
    for (const k of keepOutdoor) {
      if (items[k] !== undefined) nextItems[k] = items[k];
      if (place[k] !== undefined) nextPlace[k] = place[k];
    }
    game.items = nextItems;
    game.itemPlacements = nextPlace;
    return { ...d, version: 17, game };
  },

  /**
   * v17 → v18：**満足度（機嫌）**を追加。
   *
   * 既存の選手は全員「ふつう」から始める。実際の機嫌は次のコマの練習・回復・
   * 休養ですぐ動くので、ここで過去の状態を推測する必要はない。
   * 数値は config を将来変えても移行が壊れないよう直書きしてある。
   */
  17: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, mood: 62 }));
    return { ...d, version: 18, game };
  },

  /**
   * v18 → v19：**更衣室を廃止**。プールへはまっすぐ向かい、着いたところで水着になる。
   *
   * 建ててあった更衣室はマップから取り除き、**建設費を全額ジェムで返す**
   *（黙って部屋だけ消すと、投じた資金がそのまま消えたことになる）。
   * 返す額は当時の値段 ◆400 を直書きしてある。config を将来変えても移行は動く。
   */
  18: (d) => {
    const game = { ...(d.game as RawSave) };
    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    const lockers = equipment.filter((e) => e && e.kind === "locker");
    game.equipment = equipment.filter((e) => e && e.kind !== "locker");
    if (lockers.length > 0) {
      game.gems = Math.max(0, Math.floor(Number(game.gems) || 0)) + lockers.length * LOCKER_REFUND;
    }
    return { ...d, version: 19, game };
  },

  /**
   * v19 → v20：**情熱**（クラブ全体で1つのゲージ）を追加。
   *
   * 大会と一般客の満足から溜まり、特別練習で使う。
   * 続きから始めるプレイヤーは、新規と同じ開始値から溜め直す
   *（過去の成績から遡って計算すると、いきなり満タンになってしまうため）。
   */
  19: (d) => {
    const game = { ...(d.game as RawSave) };
    game.passion = PASSION_START;
    return { ...d, version: 20, game };
  },

  /**
   * v20 → v21：休養が「次の練習を N 回休む」から「今週から1週間休む」に変わった。
   *
   * 旧：restPending（あと何回休むか）＋ resting（今休んでいるか）の2つ
   * 新：restUntilDay（いつまで休むか。dayCount がこれ未満なら休養中）
   *
   * 旧のセーブで休みに入っていた選手は、**その週いっぱい**休む扱いに読み替える。
   * 旧仕様には「取り消しても resting の旗が下りず、二度と練習に戻らない」不具合が
   * あったので、ここを通せばその状態のまま固まっている選手も自動的に救われる。
   */
  20: (d) => {
    const game = { ...(d.game as RawSave) };
    const day = Math.max(0, Math.floor(Number(game.dayCount) || 0));
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      const wasResting = s.resting === true || (Number(s.restPending) || 0) > 0;
      const next: RawSave = { ...s, restUntilDay: wasResting ? day + 1 : 0 };
      delete next.restPending;
      delete next.resting;
      return next;
    });
    return { ...d, version: 21, game };
  },

  /**
   * v21 → v22：才能が「数値の伸びしろ」から**才能ランク**（無印／○／◎）になった。
   *
   * ランクは伸びやすさに加えて**到達できる上限**（A／S／SS）も決める。
   * v21 までの選手は talent の数値からランクに読み替える。
   * 当時のさかいめ（○＝1.25／◎＝1.52）を直書きしてあるので、
   * config を将来変えてもこの移行は同じ結果になる。
   */
  21: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      const talent = Array.isArray(s.talent) ? (s.talent as number[]) : [];
      const rank = talent.map((t) => (t >= V21_GREAT_AT ? "great" : t >= V21_GOOD_AT ? "good" : "none"));
      // 能力の数だけ無いセーブ（あり得ないが防御）は「無印」で埋める
      while (rank.length < 5) rank.push("none");
      return { ...s, talentRank: rank };
    });
    // 大会記録はここから貯め始める（過去に遡って作ると、最初の1回が必ず新記録になる）
    game.meetRecords = {};
    return { ...d, version: 22, game };
  },

  /**
   * v22 → v23：敷地の拡張が「中央から四方へ広げる」から
   * 「左上を固定して、右・下にブロックを足す」に変わった。
   *
   * 敷地の左上の角が (11,11) あたりから (1,1) へ動くので、**部屋と道をまとめて平行移動**する。
   * 相対的な配置はそのままなので、プレイヤーから見た施設の並びは1マスも変わらない。
   * 平行移動したあと、全部が収まるいちばん小さい段数に合わせる
   *（旧方式の正方形 n×n は、新方式では1段ぶん多く必要になることがある）。
   */
  22: (d) => {
    const game = { ...(d.game as RawSave) };
    const oldSteps = Math.max(0, Math.min(4, Math.floor(Number(game.landSteps) || 0)));
    // v22 までの敷地（中央ぞろえ・一辺 15+5k）
    const inner = Math.min(35, 15 + oldSteps * 5);
    const oldX0 = Math.floor((V22_MAP_COLS - inner) / 2);
    const oldY1 = Math.floor((V22_MAP_ROWS - inner) / 2) + inner - 1;
    // 新しい敷地は「左下の角」が固定。古い敷地の左下を、そこへ合わせる
    const dx = V23_LAND_ORIGIN - oldX0;
    const dy = V23_LAND_BOTTOM - oldY1;

    const equipment = Array.isArray(game.equipment) ? (game.equipment as RawSave[]) : [];
    let maxX = 0;
    let minY = Number.POSITIVE_INFINITY;
    game.equipment = equipment.map((e) => {
      if (!e || typeof e !== "object") return e;
      const gx = e.gx;
      const gy = e.gy;
      if (typeof gx !== "number" || typeof gy !== "number") return e;
      const nx = gx + dx;
      const ny = gy + dy;
      maxX = Math.max(maxX, nx);
      minY = Math.min(minY, ny);
      return { ...e, gx: nx, gy: ny };
    });

    // 平行移動した部屋が全部おさまるいちばん小さい段数にする（足りなければ買い足した扱い）
    const needW = maxX - V23_LAND_ORIGIN + 1;
    const needH = V23_LAND_BOTTOM - (Number.isFinite(minY) ? minY : V23_LAND_BOTTOM) + 1;
    let steps = oldSteps;
    for (let k = 0; k <= 4; k++) {
      const w = 15 + Math.ceil(k / 2) * 10;
      const h = 15 + Math.floor(k / 2) * 10;
      if (w >= needW && h >= needH) {
        steps = Math.max(oldSteps, k);
        break;
      }
      steps = 4;
    }
    game.landSteps = steps;
    return { ...d, version: 23, game };
  },

  /**
   * v23 → v24：才能ランクが3段階（無印／○／◎）から**7段階（E〜SS）**になった。
   *
   * 新しいランクは「その能力の成長速度」で、最初から画面に出る。
   * 昔の3段階を、いちばん近い速さのランクへ読み替える
   *（当時の伸びしろ倍率 1.0／1.25／1.52 に近いのが C／B／S）。
   * 読み替え表は直書きしてあるので、config を将来変えてもこの移行は同じ結果になる。
   */
  23: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      const old = Array.isArray(s.talentRank) ? (s.talentRank as string[]) : [];
      const rank = old.map((r) => V24_RANK_MAP[r] ?? "C");
      while (rank.length < 5) rank.push("C");
      return { ...s, talentRank: rank };
    });
    return { ...d, version: 24, game };
  },

  /**
   * v24 → v25：選手が**成長の歴史**（年度ごとの能力の記録）を持つようになった。
   *
   * 古いセーブには過去の能力が残っていない。作れないものは作らず、
   * **いまの能力を1件目**として置く。そこを出発点に、次の年度から歴史が伸びていく。
   * （さかのぼって作ると、実際には無かった成長を描いてしまう）
   */
  24: (d) => {
    const game = { ...(d.game as RawSave) };
    const year = Math.max(1, Math.floor(Number(game.year) || 1));
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      if (Array.isArray(s.history)) return s;
      const stats = Array.isArray(s.stats) ? (s.stats as number[]) : [];
      const grade = typeof s.grade === "string" ? s.grade : "";
      return { ...s, history: stats.length === 5 ? [{ year, grade, stats: [...stats] }] : [] };
    });
    return { ...d, version: 25, game };
  },

  /**
   * v25 → v26：泳法が「専門度 0〜100」から「**熟練度 0〜999**＋泳法の才能」に変わった。
   *
   *  ・熟練度 … 古い専門度を V26_PROF_SCALE 倍して目盛りを合わせる。
   *    100（旧・極めた状態）が 500 になり、発揮率でいうと 0.94 あたり。
   *    そこから先はまだ伸ばせる＝続きを育てられる、という置きかたにする。
   *  ・才能   … 古いセーブには無いので、**選手 id から決まる固定の乱数**で配る。
   *    読み込むたびに変わると別人になってしまうので、id を種にした素朴な乱数を使う。
   *    いちばん才能のある泳法は、それまでいちばん鍛えていた泳法に寄せる。
   */
  25: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      const prof = Array.isArray(s.strokeProf) ? (s.strokeProf as number[]) : [];
      const scaled = prof.map((v) => Math.min(999, Math.max(0, (Number(v) || 0) * V26_PROF_SCALE)));
      // 個人メドレーの欄は使わなくなった（4泳法の平均で表す）
      if (scaled.length >= 5) scaled[4] = 0;
      const id = Math.max(1, Math.floor(Number(s.id) || 1));
      const talent = [0, 1, 2, 3].map((i) => v26Talent(id, i));
      // いちばん鍛えていた泳法に、いちばんの才能を寄せる
      let best = 0;
      for (let i = 1; i < 4; i++) if ((scaled[i] ?? 0) > (scaled[best] ?? 0)) best = i;
      let top = 0;
      for (let i = 1; i < 4; i++) if (talent[i] > talent[top]) top = i;
      const tmp = talent[best];
      talent[best] = talent[top];
      talent[top] = tmp;
      return { ...s, strokeProf: scaled, strokeTalent: talent };
    });
    return { ...d, version: 26, game };
  },

  /**
   * v26 → v27：選手が**実年齢**を持つようになった（一生のカーブと引退のため）。
   * 古いセーブには年齢が無いので、学年から逆算して入れる。
   * 「社会人」で止まっていた選手は、そこを起点に歳を取り始める。
   */
  26: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => {
      if (!s || typeof s !== "object") return s;
      if (typeof s.age === "number" && s.age > 0) return s;
      const grade = typeof s.grade === "string" ? s.grade : "";
      const i = V27_GRADE_SEQ.indexOf(grade);
      return { ...s, age: i < 0 ? 23 : 4 + i };
    });
    if (!Array.isArray(game.retired)) game.retired = [];
    return { ...d, version: 27, game };
  },

  /**
   * v27 → v28：コーチの募集が「溜まっていく名簿」になった。
   *
   * 古いセーブには名簿が無いので空で始める。空のままだと募集画面が
   * 「誰も応募していない」状態で開くが、**次の月初に初期人数ぶんが入る**
   *（→ GameState.refillRecruitPool）ので詰まらない。
   */
  27: (d) => {
    const game = { ...(d.game as RawSave) };
    if (!Array.isArray(game.recruitPool)) game.recruitPool = [];
    if (typeof game.monthCount !== "number") game.monthCount = 0;
    return { ...d, version: 28, game };
  },

  /**
   * v28 → v29：注目選手の印（pinned）を追加。
   * 既存のセーブには印が無いので、全員 false から始める
   *（勝手に誰かへ★を付けると「付けた覚えのない子」が HUD に居座る）。
   */
  28: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, pinned: false }));
    return { ...d, version: 29, game };
  },

  /**
   * v30 → v31：部屋ごとの今月の利用回数（roomUse）を追加。
   * 古いセーブには無いので、空（＝全部0）から数え直す。
   */
  30: (d) => ({ ...d, version: 31, game: { ...(d.game as RawSave), roomUse: [] } }),

  /**
   * v29 → v30：退会の予告（leaveAtMonth）を追加。
   *
   * 古いセーブには予告が無いので、全員「予定なし」から始める。
   * すでに年齢を超えている子がいても、ここでは印を付けない
   *（読み込んだ瞬間に「来月で退会」が並ぶと、身に覚えのない知らせになる）。
   * 次の年度更新で改めて予告が出る。
   */
  29: (d) => {
    const game = { ...(d.game as RawSave) };
    const students = Array.isArray(game.students) ? (game.students as RawSave[]) : [];
    game.students = students.map((s) => ({ ...s, leaveAtMonth: null }));
    return { ...d, version: 30, game };
  },
};

/** v27 当時の学年の並び（移行の結果を変えないよう直書き）。 */
const V27_GRADE_SEQ: readonly string[] = [
  "年少", "年中", "年長",
  "小1", "小2", "小3", "小4", "小5", "小6",
  "中1", "中2", "中3",
  "高1", "高2", "高3",
  "大1", "大2", "大3", "大4",
  "社会人",
];

/** v25 までの専門度（0〜100）を熟練度（0〜999）へ合わせる倍率。 */
const V26_PROF_SCALE = 5;

/** id から決まる泳法の才能（0〜1）。読み込むたびに変わらないよう、素朴な固定の乱数を使う。 */
function v26Talent(id: number, index: number): number {
  const x = Math.sin(id * 12.9898 + index * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1000) / 1000;
}

/** v23 までの3段階を、7段階のどれに読み替えるか（移行の結果を変えないよう直書き）。 */
const V24_RANK_MAP: Record<string, string> = { none: "C", good: "B", great: "S" };

/** v22 当時のマップの大きさと、v23 の敷地の起点（移行の結果を変えないよう直書き）。 */
const V22_MAP_COLS = 37;
const V22_MAP_ROWS = 37;
const V23_LAND_ORIGIN = 5;
/** v23 の敷地の下辺（landOrigin + 最大の高さ - 1 ＝ 5 + 35 - 1）。 */
const V23_LAND_BOTTOM = 39;

/** v21 当時の才能のさかいめ（移行の結果を変えないよう直書き）。 */
const V21_GOOD_AT = 1.25;
const V21_GREAT_AT = 1.52;

/** 廃止した更衣室1つぶんの返金（当時の建設費）。 */
const LOCKER_REFUND = 400;

/** v20 で入れた情熱の開始値（config を将来変えても移行は動くよう直書き）。 */
const PASSION_START = 20;

export type MigrateResult =
  | { ok: true; data: SaveData; migratedFrom: number | null }
  | { ok: false; reason: string };

/** 素の JSON が最低限セーブデータの形をしているか。 */
function looksLikeSave(d: RawSave): boolean {
  const game = d.game as RawSave | undefined;
  return !!game && typeof game === "object" && Array.isArray(game.students);
}

/** JSON 文字列 → 現行バージョンのセーブデータ。読めなければ理由を返す。 */
export function migrateSave(raw: unknown): MigrateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "データが壊れています" };

  let data = raw as RawSave;
  const from = typeof data.version === "number" ? data.version : null;

  if (from === null) return { ok: false, reason: "バージョン情報がありません" };
  if (from > SAVE_VERSION) {
    return { ok: false, reason: `新しいバージョン（v${from}）のデータです。アプリを更新してください` };
  }

  let v = from;
  while (v < SAVE_VERSION) {
    const step = STEPS[v];
    if (!step) return { ok: false, reason: `v${v} からの変換方法がありません` };
    data = step(data);
    const next = typeof data.version === "number" ? data.version : v + 1;
    if (next <= v) return { ok: false, reason: "変換が進みませんでした" }; // 無限ループ防止
    v = next;
  }

  if (!looksLikeSave(data)) return { ok: false, reason: "データが壊れています" };
  return { ok: true, data: data as unknown as SaveData, migratedFrom: from === SAVE_VERSION ? null : from };
}

/** 文字列からの読み込み（JSON.parse の失敗も理由に変える）。 */
export function parseSave(text: string): MigrateResult {
  try {
    return migrateSave(JSON.parse(text));
  } catch {
    return { ok: false, reason: "データを読み取れません" };
  }
}
