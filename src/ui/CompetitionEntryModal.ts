import Phaser from "phaser";
import { formatTime, GENDER_LABEL, predictTime, STROKE_LABEL, type RaceEvent, type Student } from "../sim/student";
import { effectiveStandard, STANDARD_SHORT } from "../data/standardTimes";
import { clearedEventsOf } from "../sim/competitions";
import { competitionById, isTimeTrial, SCALE_LABEL, type Competition } from "../sim/competitions";
import { conditionLevel, conditionTimeFactor, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import { ALL_EVENTS } from "../data/standardTimes";
import { classLabel } from "../sim/classes";
import { rankOf, rankShort } from "../sim/rank";
import type { GameState } from "../sim/state";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { RACE } from "../config/balance";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import type { Button } from "./Button";
import { attachLongPress } from "./longPress";

/** カードを見に行って戻ってくるときに持ち帰る、選びかけの内容。 */
export interface EntrySnapshot {
  compId: string;
  event: RaceEvent;
  chosenIds: number[];
}

export interface EntryOptions {
  /** 選手の行を長押ししたとき（その選手のカードを開く）。snap を渡し返せば同じ画面に戻れる。 */
  onOpenCard?: (s: Student, snap: EntrySnapshot) => void;
  /** 開いたときに戻す選びかけの内容。 */
  restore?: EntrySnapshot;
  /** 出場確認が届いている主要大会を押したとき（出場確認の一覧を開く）。 */
  onOpenConfirm?: (comp: Competition) => void;
  /** メドレーリレー（12月の世界選手権）を泳ぐ。 */
  onRelay?: () => void;
}

/**
 * 大会の出場選択。
 *
 *  1) 今月クラブが出られる大会を選ぶ
 *  2) 種目を選び、その種目に出す選手を複数えらぶ → 会場へ
 *
 * 同じレースに複数人出せる（＝同じ組で泳ぐ）ので、種目は全員で共通。
 * 男女別レースなので、最初に選んだ選手と違う性別の選手は選べなくなる。
 *
 * 画面の作り：
 *   head … スクロールしない枠（戻る・種目セレクタ・下段の出場ボタン）
 *   body … スクロールする一覧（大会の並び／選手の並び）
 * スクロールの窓はどちらの画面でも同じ範囲なので、Modal.enableScroll は
 * 最初に一度だけ呼べばよい（窓の外は隠れるため、一覧は必ず窓の中に置く）。
 */
export class CompetitionEntryModal {
  private readonly m: Modal;
  /** スクロールしない枠。画面を切り替えるたびに作り直す。 */
  private readonly head: Phaser.GameObjects.Container;

  private readonly listTop: number;
  private readonly footerH = 62;

  private comp?: Competition;
  private event: RaceEvent = { ...ALL_EVENTS[0] };
  /** 選んだ選手（並び順＝選んだ順。先頭の性別がレースの性別になる）。 */
  private chosen: Student[] = [];

  private goBtn?: Button;
  private countText?: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onEnter: (students: Student[], comp: Competition, ev: RaceEvent) => void,
    onClose: () => void,
    private readonly opts: EntryOptions = {},
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(720, GAME_WIDTH - 20),
        height: Math.min(760, GAME_HEIGHT - 40),
        title: `大会　${state.dateLabel}`,
        subtitle: "記録会は育成B以上、予選から勝ち上がる大会は選手・プロ。同じ種目に複数人を出せる。",
      },
      onClose,
    );
    this.head = scene.add.container(0, 0);
    this.m.container.add(this.head);

    // 標準記録の行（種目セレクタの下）を入れたぶん、一覧の始まりを下げてある
    this.listTop = this.m.contentTop + 132;
    this.m.enableScroll(this.listTop, this.m.ph - this.listTop - this.footerH);

    this.showCompetitions();
    if (opts.restore) this.restore(opts.restore);
  }

  /** カードを見て戻ってきたときに、選んでいた大会・種目・メンバーを戻す。 */
  private restore(snap: EntrySnapshot): void {
    const comp = this.state.competitionsForClub().find((c) => c.id === snap.compId);
    if (!comp) return; // その間に出られなくなっていたら大会選択のまま
    this.comp = comp;
    this.event = { ...snap.event };
    const athletes = this.state.eligibleAthletesFor(comp);
    this.chosen = snap.chosenIds
      .map((id) => athletes.find((a) => a.id === id))
      .filter((a): a is Student => !!a);
    this.showEntry();
  }

  destroy(): void {
    this.m.destroy();
  }

  private get pw(): number {
    return this.m.pw;
  }

  private get ph(): number {
    return this.m.ph;
  }

  /** 画面切り替え。スクロールしない枠と一覧の両方を空にする。 */
  private resetScreen(): void {
    this.head.removeAll(true);
    this.m.clearBody();
    this.goBtn = undefined;
    this.countText = undefined;
  }

  // ------------------------------------------------------------- 大会選択

  private showCompetitions(): void {
    this.resetScreen();
    this.comp = undefined;
    this.chosen = [];

    // 自分でエントリーするのは記録会だけ（主要大会は開催の2週間前に出場確認が届く）
    const comps = this.state.competitionsForClub().filter(isTimeTrial);
    this.m.text(24, this.m.contentTop + 18, "エントリーする記録会をえらぶ", 15, "#ecf0f1", true, this.head);
    this.m.text(
      24,
      this.m.contentTop + 42,
      "記録会はエントリーの2週間後にレース。主要大会は2週間前に出場確認が届く。",
      11.5,
      "#9fb3c4",
      false,
      this.head,
    );

    let y0 = this.listTop + 28;
    if (comps.length === 0) {
      this.m
        .text(28, y0, "今月出られる大会はありません（育成Bへ昇格させると記録会に出せます）。", 13, "#95a6b8", false, this.m.body);
      y0 += 30;
    }

    // 1行に「大会名／規模」と「参加料＋遠征費・遠征日数」を出す（費用を見て選べるように）
    const rh = 66;
    comps.forEach((c, i) => {
      const y = y0 + i * rh;
      this.m.button(
        (this.pw - this.m.scrollGutter) / 2,
        y,
        this.pw - 56 - this.m.scrollGutter,
        44,
        `${c.name}　［${SCALE_LABEL[c.scale]}］`,
        () => this.selectComp(c),
        { color: c.scale === "kirokukai" ? 0x2c3e50 : 0x2e5a8f, hoverColor: 0x3d6fb0, fontSize: 15 },
        this.m.body,
      );
      const away = this.state.raceAwayDays(c);
      const travel = this.state.raceTravelFee(c);
      const cost = `1人 参加料◆${this.state.raceEntryFee(c)}${travel > 0 ? ` ＋ 遠征費◆${travel}` : "（遠征費なし）"}`;
      this.m
        .text(28, y + 26, cost, 11.5, "#9fb3c4", false, this.m.body);
      if (away > 0) {
        this.m
          .text(this.pw - 34 - this.m.scrollGutter, y + 26, `遠征 ${away}週は練習不可`, 11.5, "#e59866", true, this.m.body)
          .setOrigin(1, 0);
      }
    });

    // ---- 年間予定（開催月つき）----
    // 勝ち上がりの先（都道府県以降）は、前の段階を優勝するまでここに現れない。
    let y = y0 + comps.length * rh + 12;

    // ---- 出場確認が届いている主要大会（開催の2週間前〜前週）----
    for (const c of this.opts.onOpenConfirm ? this.state.majorsInConfirmWindow() : []) {
      this.m.button(
        (this.pw - this.m.scrollGutter) / 2,
        y + 22,
        this.pw - 56 - this.m.scrollGutter,
        44,
        `📣 ${c.name} の出場確認（${this.state.raceDayLabel(this.state.majorRaceDay())}）`,
        () => this.opts.onOpenConfirm?.(c),
        { color: 0x8e6a2f, hoverColor: 0xb8893c, fontSize: 14 },
        this.m.body,
      );
      y += 56;
    }

    /**
     * ---- メドレーリレー（12月の世界選手権）----
     *
     * 日本選手権（10月）の100mで優勝した選手は日本代表になる。
     * 個人種目とは別枠なので、**ここから直接泳ぎに行ける**ようにしてある
     *（出場確認の仕組みに乗せると、個人種目に出さない年は泳げなくなる）。
     */
    const relay = this.opts.onRelay ? this.state.relayEntry() : null;
    if (relay) {
      const who = relay.members.map((s) => s.name).join("・");
      this.m.button(
        (this.pw - this.m.scrollGutter) / 2,
        y + 22,
        this.pw - 56 - this.m.scrollGutter,
        44,
        `🇯🇵 400mメドレーリレー（日本代表）を泳ぐ`,
        () => this.opts.onRelay?.(),
        { color: 0x8e2f4a, hoverColor: 0xb8435f, fontSize: 15 },
        this.m.body,
      );
      y += 52;
      const note = this.m.text(
        28,
        y,
        `${relay.gender === "f" ? "女子" : "男子"}　自クラブの代表：${who}　（空いた枠はよそのクラブの代表が泳ぐ）`,
        11.5,
        "#f5b7b1",
        false,
        this.m.body,
      );
      setJaWrap(note, this.pw - 56 - this.m.scrollGutter);
      y += note.height + 12;
    }

    // ---- エントリー中のレース（開催日を待っている）----
    const pending = [...this.state.pendingRaces].sort((a, b) => a.raceDay - b.raceDay);
    if (pending.length > 0) {
      this.m.text(28, y, "── エントリー中のレース ──", 14, "#aed6f1", true, this.m.body);
      y += 24;
      for (const r of pending) {
        const c = competitionById(r.compId);
        const names = r.studentIds
          .map((id) => this.state.findStudent(id)?.name)
          .filter((n): n is string => !!n)
          .join("・");
        const line = this.m.text(
          34,
          y,
          `${this.state.raceDayLabel(r.raceDay)}　${c?.name ?? "大会"}　${r.event.distance}m ${STROKE_LABEL[r.event.stroke]}　${names}`,
          12,
          "#ecf0f1",
          false,
          this.m.body,
        );
        setJaWrap(line, this.pw - 70 - this.m.scrollGutter);
        y += line.height + 8;
      }
      y += 8;
    }
    this.m.text(28, y, "── 年間の主要大会 ──", 14, "#f7dc6f", true, this.m.body);
    y += 24;
    const note = this.m.text(28, y, "", 11.5, "#9fb3c4", false, this.m.body).setOrigin(0, 0);
    // 日本語は既定の折り返しでは止まらない（→ ui/textWrap.ts）。幅を決めてから中身を入れる。
    setJaWrap(note, this.pw - 56 - this.m.scrollGutter);
    note.setText("灰色の行はまだ出られない大会（右に理由）。勝ち上がる大会は、前の段階で優勝すると次が現れる。");
    y += note.height + 8;

    const rows = this.state.seasonSchedule();
    if (rows.length === 0) {
      this.m.text(28, y, "まだ出場できる大会がありません（選手クラスに上げよう）。", 12.5, "#95a6b8", false, this.m.body);
      y += 26;
    }
    for (const r of rows) {
      const monthLabel = r.month === 0 ? "毎月" : `${r.month}月`;
      // 【理由は2段目に置く】大会名と理由を同じ行の左右に置くと、
      // 「中学生の選手が出場（いまクラブにいない）」のような長い理由が名前に重なる。
      // 【枠は文を測ってから】理由は2行になることがあるので、先に文を置いて高さを測り、
      // そのあと枠を描いていちばん後ろへ回す（枠から文がはみ出さない）。
      this.m.text(34, y + 6, monthLabel, 13, r.open ? "#f7dc6f" : "#8fa3b5", true, this.m.body);
      this.m.text(
        86,
        y + 6,
        `${r.name}　［${SCALE_LABEL[r.scale]}］`,
        13,
        r.open ? "#ecf0f1" : "#9fb3c4",
        r.open,
        this.m.body,
      );
      const note = this.m.text(86, y + 26, r.note, 10.5, r.open ? "#2ecc71" : "#95a6b8", false, this.m.body);
      setJaWrap(note, this.pw - 130 - this.m.scrollGutter);
      const h = 32 + note.height;
      const box = this.scene.add
        .rectangle(
          (this.pw - this.m.scrollGutter) / 2,
          y + h / 2,
          this.pw - 56 - this.m.scrollGutter,
          h,
          r.open ? 0x1f4a3a : 0x1a2b3c,
          1,
        )
        .setStrokeStyle(1, r.open ? 0x2ecc71 : 0x2a3f52, 1);
      this.m.body.add(box);
      this.m.body.sendToBack(box);
      y += h + 6;
    }

    this.m.setContentHeight(y + 16);
  }

  /** 見た目確認から、開ける大会の1つ目を選んでおく（?open=comp）。 */
  devSelectFirst(): void {
    const c = this.state.competitionsForClub().filter(isTimeTrial);
    if (c.length > 0) this.selectComp(c[0]);
  }

  private selectComp(comp: Competition): void {
    this.comp = comp;
    this.chosen = [];
    const athletes = this.state.eligibleAthletesFor(comp);
    // 勝ち上がりの大会は「前の段で優勝した種目」でしか出られないので、
    // その種目を初期値にしておく（開いた瞬間に誰も選べない画面にしない）
    const won = comp.requiresPrev
      ? athletes.flatMap((a) => clearedEventsOf(a, comp.requiresPrev!))
      : [];
    if (won.length > 0) this.event = { ...won[0] };
    else if (athletes[0]) this.event = { ...athletes[0].fav };
    this.showEntry();
  }

  // ------------------------------------------------------------- 種目・選手選択

  private cycleEvent(dir: number): void {
    let idx = ALL_EVENTS.findIndex((e) => e.stroke === this.event.stroke && e.distance === this.event.distance);
    if (idx < 0) idx = 0;
    idx = (idx + dir + ALL_EVENTS.length) % ALL_EVENTS.length;
    this.event = { ...ALL_EVENTS[idx] };
    this.showEntry();
  }

  private toggle(s: Student): void {
    const at = this.chosen.findIndex((x) => x.id === s.id);
    if (at >= 0) this.chosen.splice(at, 1);
    else if (this.state.raceEntryStatus(s, this.comp!, this.chosen, this.event).ok) this.chosen.push(s);
    this.showEntry();
  }

  private showEntry(): void {
    this.resetScreen();
    const comp = this.comp!;
    const head = this.head;
    const max = this.state.maxRaceEntries();
    const top = this.m.contentTop;

    // --- 見出し（大会選択へ戻る／大会名／ルール）
    this.m.button(60, top + 16, 104, 30, "◀ 大会選択", () => this.showCompetitions(), {
      color: 0x555f6b,
      hoverColor: 0x6b7684,
      fontSize: 12,
    }, head);
    this.m.text(122, top + 4, `${comp.name}　［${SCALE_LABEL[comp.scale]}］`, 14, "#ecf0f1", true, head);
    this.m.text(
      122,
      top + 24,
      `${this.state.raceDayLabel(this.state.raceDayFor(comp))}にレース　最大${max}人　1人 ◆${this.state.raceEntryFee(comp) + this.state.raceTravelFee(comp)}（参加料+遠征費）` +
        `${this.state.raceAwayDays(comp) > 0 ? `　遠征${this.state.raceAwayDays(comp)}週` : ""}　所持 ◆${Math.round(this.state.gems)}`,
      11.5,
      "#9fb3c4",
      false,
      head,
    );

    // --- 種目セレクタ（全員この種目で泳ぐ）
    const evY = top + 66;
    this.m.button(44, evY, 40, 36, "◀", () => this.cycleEvent(-1), { fontSize: 14 }, head);
    this.m
      .text(this.pw / 2, evY, `${this.event.distance}m ${STROKE_LABEL[this.event.stroke]}`, 20, "#f7dc6f", true, head)
      .setOrigin(0.5);
    this.m.button(this.pw - 44, evY, 40, 36, "▶", () => this.cycleEvent(1), { fontSize: 14 }, head);

    // --- その種目の参加標準記録（全世代共通の1つ＝日本選手権 → competitions.standardKeysFor）。
    // 【なぜここに出すか】「あと何秒縮めれば届くのか」が見えないと、
    // 大会に出す意味が「勝てるかどうか」だけになってしまう。
    // 男女でタイムが違うので、選んでいる選手が居れば**その子の性別**で出す。
    const gender = this.chosen[0]?.gender ?? "m";
    const stdTime = effectiveStandard("nihonSenshuken", this.event, gender).time;
    this.m
      .text(
        this.pw / 2,
        evY + 22,
        `${GENDER_LABEL[gender]}　参加標準記録 ${formatTime(stdTime)}（切れば日本選手権へ・全世代共通）`,
        11.5,
        "#9fb3c4",
        false,
        head,
      )
      .setOrigin(0.5, 0);

    // 勝ち上がりの大会は「前の段で優勝した種目」でしか出られない。
    // どの種目なら出られるのかを、種目セレクタのそばに書いておく
    if (comp.requiresPrev) {
      const won = new Map<string, string>();
      for (const a of this.state.eligibleAthletesFor(comp)) {
        for (const e of clearedEventsOf(a, comp.requiresPrev)) {
          won.set(`${e.stroke}-${e.distance}`, `${STROKE_LABEL[e.stroke]}${e.distance}m`);
        }
      }
      const label =
        won.size > 0
          ? `勝ち上がった種目でだけ出られる：${[...won.values()].join("・")}`
          : "前の段で優勝した種目でだけ出られる";
      const t = this.m.text(this.pw / 2, evY + 38, "", 11, "#f7dc6f", true, head).setOrigin(0.5, 0);
      setJaWrap(t, this.pw - 60);
      t.setText(label);
    }

    // --- 選手一覧（その種目の予想タイムが速い順）
    const athletes = this.state
      .eligibleAthletesFor(comp)
      .slice()
      .sort((a, b) => predictTime(a, this.event) - predictTime(b, this.event));

    if (athletes.length === 0) {
      this.m.text(this.pw / 2, this.listTop + 50, "この大会に出られる選手/プロがいません。", 15, "#95a6b8", false, this.m.body)
        .setOrigin(0.5, 0);
      this.m.setContentHeight(0);
      return;
    }

    const rh = 84; // 得意種目・コンディション・標準記録まで入れたぶん、行を高くしてある
    athletes.forEach((s, i) => this.buildRow(s, comp, this.listTop + 6 + i * rh, rh));
    this.m.setContentHeight(this.listTop + 14 + athletes.length * rh);

    // --- 下段：選んだ人数と出場ボタン
    const fy = this.ph - 34;
    this.countText = this.m.text(22, fy - 22, "", 12.5, "#aed6f1", false, head);
    this.goBtn = this.m.button(this.pw - 96, fy, 150, 42, "エントリー ▶", () => this.go(), {
      color: 0x8e6a2f,
      hoverColor: 0xb8893c,
      fontSize: 15,
    }, head);
    this.refreshFooter();
  }

  private refreshFooter(): void {
    const n = this.chosen.length;
    const names = this.chosen.map((s) => s.name).join("・");
    // 残りのレーンは他クラブが埋める。人数を出すほど相手が減るのが分かるように書く。
    const rivals = RACE.lanes - n;
    const cost = this.state.raceEntryCost(this.comp!, n);
    const afford = this.state.canAffordEntry(this.comp!, n);
    // 右にエントリーのボタンがあるぶん幅が狭い。折り返しに任せず、段は自分で決める。
    // 幅は中身を入れる前に決めること（→ ui/textWrap.ts）。
    setJaWrap(this.countText!, this.pw - 200);
    this.countText?.setText(
      n === 0
        ? `出場させる選手をえらぶ\n（長押しで選手カード）　1人 ◆${this.state.raceEntryFee(this.comp!) + this.state.raceTravelFee(this.comp!)}`
        : `${n}人：${names}\n予選の相手 ${rivals}人（上位${RACE.advanceCount}人が決勝へ）　出場費 ◆${cost}`,
    );
    this.countText?.setColor(afford.ok ? "#aed6f1" : "#e74c3c");
    this.goBtn
      ?.setLabel(n === 0 ? "エントリー ▶" : afford.ok ? `◆${cost} でエントリー ▶` : "出場費が足りない")
      .setEnabled(n > 0 && afford.ok);
  }

  private buildRow(s: Student, comp: Competition, y: number, rh: number): void {
    const body = this.m.body;
    const w = this.pw - 40 - this.m.scrollGutter;
    const picked = this.chosen.some((x) => x.id === s.id);
    const status = this.state.raceEntryStatus(s, comp, this.chosen, this.event);
    // いま選んでいる種目が、その子の得意そのものか（泳法だけ一致かも見る）
    const sameStroke = s.fav.stroke === this.event.stroke;
    const exact = sameStroke && s.fav.distance === this.event.distance;

    const rect = this.scene.add
      .rectangle(20 + w / 2, y + rh / 2 - 4, w, rh - 8, picked ? 0x24506b : 0x1c3550, 1)
      .setStrokeStyle(picked ? 2 : 1, picked ? 0xf7dc6f : 0x2e4a66, 1);
    body.add(rect);
    // 行を長押しで、**この行の選手**のカードへ（行は描き直すたびに作り直すので、s をそのまま使える）。
    // スクロールの窓の外（ヘッダの裏）に隠れた行では反応させない
    if (this.opts.onOpenCard) {
      attachLongPress(this.scene, rect, () => s, (who) => this.openCard(who), (p) => this.m.isInsideView(p.x, p.y));
    }

    // チェックボタン（押すと出場メンバーに入る／外れる）
    const btn = this.m.button(
      52,
      y + rh / 2 - 4,
      44,
      38,
      picked ? "☑" : "□",
      () => this.toggle(s),
      { color: picked ? 0x2e7d5b : 0x2c3e50, hoverColor: 0x3d5a80, fontSize: 18 },
      body,
    );
    if (!status.ok) btn.setEnabled(false);

    this.m.text(84, y + 4, s.name, 15, picked ? "#ffffff" : "#ecf0f1", true, body);

    // 得意種目。いま選んでいる種目と合っているかが一目で分かるように色を変える。
    const fav = `得意 ${STROKE_LABEL[s.fav.stroke]}${s.fav.distance}m${exact ? " ◎" : sameStroke ? " ○" : ""}`;
    this.m.text(
      84,
      y + 24,
      fav,
      12.5,
      exact ? "#f7dc6f" : sameStroke ? "#7fd8c0" : "#8fa3b5",
      exact || sameStroke,
      body,
    );

    const level = conditionLevel(s.condition);
    const sub = `${classLabel(s.classId)}・${s.grade}・${GENDER_LABEL[s.gender]}　格${rankShort(rankOf(s))}`;
    this.m.text(84, y + 42, sub, 11, "#9fb3c4", false, body);
    // コンディションはタイムに直接効くので、選ぶ前に見えるようにしておく
    this.m.text(252, y + 42, `${CONDITION_ICON[level]} ${CONDITION_LABEL[level]}`, 11, CONDITION_COLOR[level], true, body);

    // 予想タイム（この種目・いまのコンディション込み）
    this.m
      .text(20 + w - 12, y + 6, `予想 ${formatTime(predictTime(s, this.event) * conditionTimeFactor(level))}`, 13.5, "#aed6f1", true, body)
      .setOrigin(1, 0);

    // 参加標準記録（全世代共通）まで、あと何秒か（届いていれば「突破」）
    const key = "nihonSenshuken" as const;
    const std = effectiveStandard(key, this.event, s.gender).time;
    {
      const pred = predictTime(s, this.event) * conditionTimeFactor(level);
      const diff = pred - std;
      const done = diff <= 0;
      this.m
        .text(
          20 + w - 12,
          y + 26,
          done
            ? `${STANDARD_SHORT[key]} 突破圏`
            : `${STANDARD_SHORT[key]} ${formatTime(std)}（あと ${diff.toFixed(2)}秒）`,
          11,
          done ? "#7fd8c0" : "#9fb3c4",
          done,
          body,
        )
        .setOrigin(1, 0);
    }

    if (!status.ok && status.reason) {
      this.m.text(20 + w - 12, y + 44, status.reason, 11, "#e59866", false, body).setOrigin(1, 0);
    }
  }

  /** 行の長押し：その選手のカードへ（戻ってきたら、選びかけの内容をそのまま戻す）。 */
  private openCard(s: Student): void {
    if (!this.comp) return;
    this.opts.onOpenCard?.(s, { compId: this.comp.id, event: { ...this.event }, chosenIds: this.chosen.map((x) => x.id) });
  }

  private go(): void {
    if (this.chosen.length === 0 || !this.comp) return;
    if (!this.state.canAffordEntry(this.comp, this.chosen.length).ok) return;
    this.onEnter([...this.chosen], this.comp, { ...this.event });
  }
}
