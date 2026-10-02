import { bgm } from "../audio/bgm";
import Phaser from "phaser";
import { setJaWrap } from "../ui/textWrap";
import { CHAR_SCALE, COLORS, GAME_HEIGHT, GAME_WIDTH, MEET_LANE_COUNT, TILE_H, TILE_W } from "../config";
import { depthFor, isoToWorld } from "../iso/projection";
import { bodyForStage, charTypeOf, variantForGender } from "../gfx/textures";
import { applyCharSprite, charTexture } from "../gfx/charAssets";
import { charFacing, flipXFor } from "../gfx/charFacing";
import type { CharMode } from "../gfx/charSprites";
import { lifeStageOf } from "../sim/growth";
import { bakeChunks } from "../gfx/bake";
import { formatTime, STROKE_LABEL, type RaceEvent, type Student } from "../sim/student";
import type { Competition } from "../sim/competitions";
import type { CompetitionEntryResult, CompetitionResult, RelayResult } from "../sim/state";
import { RELAY_DISTANCE, type RelayTeam } from "../sim/relay";
import type { Racer } from "../sim/race";
import { Button } from "../ui/Button";
import { STANDARD_LABEL } from "../data/standardTimes";
import { CelebrationLayer } from "../gfx/Celebration";
import { ensurePortrait } from "../gfx/portrait";
import { applyRenderScale } from "../gfx/renderScale";

export interface MeetData {
  /** 出場させた自クラブの選手（同じ組で泳ぐ）。 */
  students: Student[];
  comp: Competition;
  /** 泳ぐ種目（全員共通）。 */
  event: RaceEvent;
  resolve: () => CompetitionResult;
  onClose: () => void;
  /**
   * その日に泳ぐレースの一覧（いま泳ぐぶんを含む）。
   * 1レースずつしか会場に出ないので、**今日どれだけ出るのか**をここで見せる。
   */
  dayCard?: { label: string; mine: string; current: boolean }[];
  /**
   * リレーとして走らせるとき（12月の世界選手権のメドレーリレー）。
   * これがあるときは個人種目の予選→決勝ではなく、**4人が1往復ずつ泳ぐ**1本勝負になる。
   * resolve は呼ばれない（結果は resolveRelay が返す）。
   */
  resolveRelay?: () => RelayResult | null;
  /**
   * 「全結果へ」を押したとき（その日の残りのレースをアニメーション無しで泳ぎ、結果一覧へ）。
   * 渡されていなければボタンを出さない（リレー・単発のレースなど）。
   */
  onSkipAll?: () => void;
}

/** リレー1チームぶんの走り（1レーン）。 */
interface RelayLane {
  team: RelayTeam;
  lane: number;
  /** 4人ぶんの絵。泳いでいる人だけを出す。 */
  sprites: Phaser.GameObjects.Sprite[];
  /** 1人ぶんの往復にかける秒。 */
  legDur: number[];
  /** 何秒目にその人が飛び込むか（cum[0]=0、cum[4]=完泳）。 */
  cum: number[];
  legIndex: number;
  finished: boolean;
  ring?: Phaser.GameObjects.Ellipse;
}

const POOL_LEN = 12; // 水面の長さ（列）
/** 観客席の高さ（px）。row 0 をこのぶん持ち上げて立体に見せる。 */
const STAND_RISE = 34;
const SWIM_START = 1;
const SWIM_END = POOL_LEN;

interface Lane {
  racer: Racer;
  /** 実際のコース番号（1〜8）。 */
  lane: number;
  sprite: Phaser.GameObjects.Image;
  duration: number; // 完泳までの秒
  progress: number;
  finished: boolean;
  ring?: Phaser.GameObjects.Ellipse;
}

/**
 * コース割り当て。
 *
 * **結果順にコースを決めてはいけない。**
 * 以前は「速い順に 4→5→3→6…」と並べていたので、スタート前に
 * 4コースの選手を見ただけで優勝が分かってしまっていた。
 * レースごとにコースをシャッフルして、泳いでみるまで分からないようにする。
 */
function shuffledLanes(count: number, rand: () => number): number[] {
  const lanes = Array.from({ length: MEET_LANE_COUNT }, (_, i) => i + 1);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes.slice(0, count);
}

type Stage = "heat" | "final";

/**
 * 「あと少し」と出すタイム差のさかいめ（秒）。
 * ここより小さい差で負けたら、次はもう手が届く＝伸ばし方を変える価値がある、の合図。
 */
const MEET_CLOSE_GAP = 0.8;

/** 表彰の見た目（順位ごと）。 */
const PODIUM: Record<number, { icon: string; label: string; color: string }> = {
  1: { icon: "🏆", label: "優勝！", color: "#f7dc6f" },
  2: { icon: "🥈", label: "準優勝", color: "#d8dde3" },
  3: { icon: "🥉", label: "第3位", color: "#e0a267" },
};

/**
 * お祝いの表示時間（秒）。**短くテンポよく**が肝。
 * 長いと、何人も出したときに結果までなかなかたどり着かない。
 */
const MEET_CELEBRATE_SEC = { record: 1.5, podium: 1.4, win: 1.9 } as const;

/**
 * 大会会場（8レーン）。予選→決勝を順に見せる。
 *
 * 自クラブから複数人を同じ組に出せるので、自クラブの選手には金色のリングを付けて
 * 見分けられるようにしてある。予選で敗退した選手も、予選のレースには映る。
 * レース結果は sim/race の outcome をそのまま可視化するだけ（勝敗は既に決まっている）。
 * 画面タップでそのレースを最後まで飛ばせる（テンポ優先）。
 */
export class MeetScene extends Phaser.Scene {
  private meta!: MeetData;
  private result!: CompetitionResult;
  private world!: Phaser.GameObjects.Container;
  private laneLayer!: Phaser.GameObjects.Container;
  private lanes: Lane[] = [];

  private stage: Stage = "heat";
  /** リレーのときだけ使う（個人種目のときは空）。 */
  private relay?: RelayResult;
  private relayLanes: RelayLane[] = [];
  private started = false;
  private stageDone = false;
  private elapsed = 0;
  private finishOrder: Racer[] = [];
  private boardLines: Phaser.GameObjects.Text[] = [];
  private stageText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private nextBtn?: Button;
  /** 泳ぎを飛ばすボタン（結果は変わらない）。 */
  private skipBtn?: Button;
  /** その日の残りを全部飛ばして結果一覧へ行くボタン。 */
  private skipAllBtn?: Button;
  private done = false;
  /**
   * いま泳いでいるレースの通し番号。
   *
   * 「位置について…」→「スタート！」は時間差で呼ばれるので、**スタート前にスキップ**すると
   * 前のレースの予約があとから届き、予選の結果の上に「スタート！」を書いたり、
   * 決勝の「位置について」の最中に勝手にスタートさせたりしていた。予約はこの番号で見分ける。
   */
  private raceSeq = 0;
  /**
   * もう会場を出たか。「会場をあとにする」が2回反応すると onClose が2回呼ばれ、
   * 施設側が次のレースを2本同時に始めて、**1本の会場が上書きされて飛ばされていた**
   *（小学生のレースのあと中学生のレースが出ない、の原因）。
   */
  private exited = false;
  /** 記録更新・表彰のお祝い（短く出して、タップで飛ばせる）。 */
  private celebrate!: CelebrationLayer;

  constructor() {
    super("Meet");
  }

  create(data: MeetData): void {
    bgm.play("race"); // 大会の曲（施設に戻ると施設の曲へ戻る）
    applyRenderScale(this); // 論理540×960のまま、画素だけ細かく描く（→ gfx/renderScale.ts）
    this.meta = data;
    this.relay = data.resolveRelay ? (data.resolveRelay() ?? undefined) : undefined;
    // リレーのときは個人種目の結果を作らない（resolve は呼ばない）
    this.result = this.relay
      ? { outcome: { heat: [], final: null, entrants: [] }, entries: [], best: null, totalGems: 0, totalPopularity: 0, entryCost: 0, passion: 0, mayorPrize: 0, coachMet: null }
      : data.resolve();
    this.relayLanes = [];
    this.lanes = [];
    this.finishOrder = [];
    this.boardLines = [];
    this.started = false;
    this.stageDone = false;
    this.elapsed = 0;
    this.done = false;
    this.nextBtn = undefined;
    this.raceSeq = 0;
    this.exited = false;

    this.cameras.main.setBackgroundColor(0x0e2233);

    this.buildTopBar();
    this.buildScoreboard();
    this.buildVenue();
    this.buildDayCard();
    this.buildSkipButton();
    this.buildSkipAllButton();
    this.celebrate = new CelebrationLayer(this);

    // 【タップでスキップはしない】
    // 以前は画面のどこかに指が触れただけでレースが最後まで飛んでいた。
    // 大会は見せ場なので、意図しないタップで結果だけ出てしまわないようにしてある。
    if (this.relay) this.startRelay();
    else this.startStage("heat");
  }

  update(_time: number, delta: number): void {
    // お祝いはレースが終わってからも動く（結果パネルの手前で順に出る）
    this.celebrate?.update(Math.min(delta, 60) / 1000);
    if (!this.started || this.stageDone) return;
    const dt = Math.min(delta, 60) / 1000;
    this.elapsed += dt;
    if (this.relay) {
      this.updateRelay();
      return;
    }

    // 同じフレームで複数人がゴールしうる（スキップ時）ので、必ずタイム順に確定させる
    const justFinished: Lane[] = [];
    let remaining = 0;
    for (const ln of this.lanes) {
      if (ln.finished) continue;
      ln.progress = Math.min(1, this.elapsed / ln.duration);
      const gx = SWIM_START + (SWIM_END - SWIM_START) * ln.progress;
      this.placeSwimmer(ln, gx);
      if (ln.progress >= 1) {
        ln.finished = true;
        justFinished.push(ln);
      } else {
        remaining++;
      }
    }
    justFinished.sort((a, b) => a.duration - b.duration);
    for (const ln of justFinished) {
      this.finishOrder.push(ln.racer);
      this.onFinish(ln, justFinished.length > 1);
    }
    if (remaining === 0 && this.lanes.length > 0) this.endStage();
    this.world.sort("depth");
  }

  /**
   * 【今日のエントリー】その日に泳ぐレースを全部出す。
   *
   * 会場に出るのは1レースずつなので、種目を選べるようになってから
   * 「あと何を泳ぐのか」が分からなくなっていた。いま泳ぐぶんは明るく、
   * これからのぶんは暗く出す（済んだぶんも残す＝今日の全体像が1画面で分かる）。
   */
  private buildDayCard(): void {
    const card = this.meta.dayCard ?? [];
    if (card.length <= 1) return;
    const y = GAME_HEIGHT - 116;
    this.add
      .text(16, y, "今日のエントリー", { fontFamily: "sans-serif", fontSize: "12px", color: "#8fa3b5" })
      .setDepth(320);
    card.slice(0, 4).forEach((c, i) => {
      this.add
        .text(16, y + 18 + i * 16, `${c.current ? "▶" : "・"} ${c.label}　${c.mine}`, {
          fontFamily: "sans-serif",
          fontSize: "12.5px",
          color: c.current ? "#f7dc6f" : "#7f8fa0",
          fontStyle: c.current ? "bold" : "normal",
        })
        .setDepth(320);
    });
    if (card.length > 4) {
      this.add
        .text(16, y + 18 + 4 * 16, `ほか${card.length - 4}レース`, {
          fontFamily: "sans-serif",
          fontSize: "12px",
          color: "#7f8fa0",
        })
        .setDepth(320);
    }
  }

  /**
   * 【スキップ】泳いでいる途中でも結果まで飛ばせる。
   *
   * 1人だけの出場だと見るものが少なく、何レースもあると同じ絵を何度も待つことになる。
   * 押すと残りを一気に進めるだけで、**結果は変わらない**（勝敗はもう決まっている）。
   */
  private buildSkipButton(): void {
    this.skipBtn = new Button(this, GAME_WIDTH - 62, GAME_HEIGHT - 28, 104, 38, "スキップ ▶▶", () => this.skipRace(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 13,
    });
    this.skipBtn.setDepth(320);
  }

  /**
   * 【全結果へ ⏭⏭】その日のレースを全部見るのは大変なので、いつでも押せる「結果一覧へ」の近道。
   * 押すとこのレースの演出も飛ばして会場を出る。残りのレースは施設側がアニメーション無しで泳ぎ、
   * その日の全レースの結果一覧を出す（→ FacilityScene.finishRacesInstantly）。結果は変わらない。
   */
  private buildSkipAllButton(): void {
    this.skipAllBtn = undefined;
    if (this.relay || !this.meta.onSkipAll) return;
    // スキップの真上に置く（下段の中央は「決勝へ」のボタンが出るので空けておく）
    this.skipAllBtn = new Button(this, GAME_WIDTH - 66, GAME_HEIGHT - 74, 112, 38, "全結果へ ⏭⏭", () => this.skipAll(), {
      color: 0x6b4a2f,
      hoverColor: 0x8e6a2f,
      fontSize: 13,
    });
    this.skipAllBtn.setDepth(320);
  }

  private skipAll(): void {
    if (this.exited) return;
    this.celebrate.clear();
    this.meta.onSkipAll?.();
    this.exit();
  }

  /** 泳いでいるレースを一気に終わらせる（結果は変わらない）。 */
  private skipRace(): void {
    if (this.done || this.stageDone) return;
    this.started = true;
    // いちばん遅い泳者がゴールするところまで時計を進める
    const longest = this.relay
      ? Math.max(0, ...this.relayLanes.map((l) => l.cum[l.cum.length - 1]))
      : Math.max(0, ...this.lanes.map((l) => l.duration));
    this.elapsed = longest + 0.01;
    if (this.relay) this.updateRelay();
    else this.update(0, 16);
  }

  // ---------------------------------------------------------------- リレー

  /**
   * メドレーリレー（4人 × 100m）。
   *
   * 【1人が1往復】プールは片道 50m の見立てなので、100m ＝ 行って戻る1往復。
   * 戻って壁に触ると次の人が飛び込み、また1往復する。**4往復で終わり**。
   * 個人種目（片道1本で終わる）と違い、gx が往復するのが肝。
   *
   * 泳いでいる人だけを出す。4人ぶんの絵を先に作っておき、
   * 泳ぐ番になったら見せる（途中で作ると、その瞬間にコマが飛ぶ）。
   */
  private startRelay(): void {
    const relay = this.relay;
    if (!relay) return;
    this.stageDone = false;
    this.started = false;
    this.elapsed = 0;
    this.laneLayer.removeAll(true);
    this.relayLanes = [];
    this.stageText.setText("◼ メドレーリレー").setColor("#f7dc6f");

    const teams = relay.outcome.teams.slice(0, MEET_LANE_COUNT);
    const totals = teams.map((x) => x.total);
    const min = Math.min(...totals);
    const span = Math.max(0.001, Math.max(...totals) - min);
    const lanes = shuffledLanes(teams.length, () => Math.random());

    teams.forEach((team, i) => {
      const gy = lanes[i] ?? i + 1;
      /**
       * 見せる長さ：いちばん速いチームで 8.4 秒、遅いチームで 11.2 秒。
       * 個人種目（5.0〜7.2秒）より長いのは、4人ぶんの往復を見せるため。
       */
      const total = 8.4 + 2.8 * ((team.total - min) / span);
      // 1人ぶんの持ち時間は実際のタイムの比で割る（遅い泳者はゆっくり見える）
      const legDur = team.legs.map((l) => (l.time / team.total) * total);
      const cum: number[] = [0];
      for (const d of legDur) cum.push(cum[cum.length - 1] + d);

      const sprites = team.legs.map((leg, li) => {
        const st = leg.student;
        const body = st ? bodyForStage(lifeStageOf(st.grade)) : "teen";
        const variant = st
          ? variantForGender(st.gender === "f" ? "f" : "m", st.id)
          : variantForGender(relay.outcome.gender, i * 11 + li * 3 + 1);
        const swimMode: CharMode = body === "kid" || body === "child" ? "swim" : "swimFree";
        const typeId = charTypeOf(body, variant).id;
        const sp = this.add
          .sprite(0, 0, charTexture(swimMode, body, variant, typeId))
          .setOrigin(0.5, 0.62)
          .setDepth(depthFor(SWIM_START, gy, 50))
          .setVisible(false);
        applyCharSprite(sp, swimMode, body, variant, typeId, CHAR_SCALE * 1.15);
        // 右向きにそろえる（→ gfx/charFacing.ts）。帰りは updateRelay がこれを反転する
        const rightFlip = flipXFor(charFacing(typeId, swimMode), 1);
        sp.setFlipX(rightFlip).setData("rightFlip", rightFlip);
        this.laneLayer.add(sp);
        return sp;
      });

      let ring: Phaser.GameObjects.Ellipse | undefined;
      if (team.isPlayer) {
        ring = this.add
          .ellipse(0, 0, TILE_W * 0.6, TILE_H * 0.9, 0xffffff, 0)
          .setStrokeStyle(2, 0xf7dc6f, 1)
          .setDepth(depthFor(SWIM_START, gy, 49))
          .setVisible(false);
        this.laneLayer.add(ring);
      }

      this.relayLanes.push({ team, lane: gy, sprites, legDur, cum, legIndex: -1, finished: false, ring });
    });

    // 掲示板：スタート前はコース順にチーム名
    this.relayBoardOrder().forEach((ln, i) => {
      const line = this.boardLines[i];
      if (!line) return;
      line
        .setText(`${ln.lane}コース ${ln.team.isPlayer ? "★" : " "}${ln.team.name}`)
        .setColor(ln.team.isPlayer ? "#f7dc6f" : "#2b6b3a");
    });

    this.statusText.setText("メドレーリレー　位置について…").setColor(COLORS.textAccent);
    const seq = ++this.raceSeq;
    this.time.delayedCall(1200, () => {
      if (this.done || this.stageDone || seq !== this.raceSeq) return;
      this.statusText.setText("第1泳者 スタート！");
      this.started = true;
      this.time.delayedCall(900, () => {
        if (!this.stageDone && seq === this.raceSeq) this.statusText.setText("");
      });
    });
  }

  /** 掲示板の行の並び（コース順）。 */
  private relayBoardOrder(): RelayLane[] {
    return [...this.relayLanes].sort((a, b) => a.lane - b.lane);
  }

  /** リレーの1フレーム。往復の位置と、泳者の入れ替わりを進める。 */
  private updateRelay(): void {
    let remaining = 0;
    const order = this.relayBoardOrder();
    for (const ln of this.relayLanes) {
      if (ln.finished) continue;
      const last = ln.cum[ln.cum.length - 1];
      if (this.elapsed >= last) {
        // 4人めが壁に戻った＝完泳
        ln.finished = true;
        ln.sprites.forEach((sp) => sp.setVisible(false));
        ln.ring?.setVisible(false);
        this.finishOrder.push({ name: ln.team.name, time: ln.team.total, isPlayer: ln.team.isPlayer });
        const rank = this.finishOrder.length;
        const line = this.boardLines[rank - 1];
        if (line) {
          line
            .setText(`${rank}. ${ln.team.isPlayer ? "★" : " "}${ln.team.name} ${formatTime(ln.team.total)}`)
            .setColor(ln.team.isPlayer ? "#f7dc6f" : rank <= 3 ? "#39d353" : "#8fb7a0");
        }
        continue;
      }
      remaining++;

      // いま何人めか
      let leg = 0;
      while (leg < ln.legDur.length - 1 && this.elapsed >= ln.cum[leg + 1]) leg++;
      if (leg !== ln.legIndex) {
        // 交代：前の人を消して、次の人が飛び込む
        ln.sprites.forEach((sp, i) => sp.setVisible(i === leg));
        ln.legIndex = leg;
        if (leg > 0) this.relayTakeoverFx(ln);
      }

      const p = (this.elapsed - ln.cum[leg]) / Math.max(0.001, ln.legDur[leg]);
      // 【1往復】前半は行き、後半は帰り
      const half = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
      const gx = SWIM_START + (SWIM_END - SWIM_START) * half;
      const sprite = ln.sprites[leg];
      const pos = isoToWorld(gx, ln.lane);
      sprite.setPosition(pos.x, pos.y).setDepth(depthFor(gx, ln.lane, 50));
      // 帰りは進む向きが逆（＝右向きの状態を反転する）
      const rightFlip = sprite.getData("rightFlip") === true;
      sprite.setFlipX(p < 0.5 ? rightFlip : !rightFlip);
      if (ln.ring) {
        const mine = ln.team.legs[leg].student != null;
        ln.ring.setVisible(mine).setPosition(pos.x, pos.y + 3).setDepth(depthFor(gx, ln.lane, 49));
      }

      /**
       * 掲示板：いま泳いでいる人の名前。
       *
       * **1チームでもゴールしたら書き替えるのをやめる。** ゴールした行は
       * 「順位・チーム・合計タイム」に変わるので、そのあとも泳者の名前を
       * 書き続けると、同じ行に順位と泳者が混ざって出てしまう
       *（行はコース順で使い回しているため）。
       */
      if (this.finishOrder.length === 0) {
        const line = this.boardLines[order.indexOf(ln)];
        if (line) {
          line.setText(`${ln.lane}L ${ln.team.isPlayer ? "★" : " "}${ln.team.name} ${leg + 1}泳 ${ln.team.legs[leg].name}`);
        }
      }
    }
    if (remaining === 0 && this.relayLanes.length > 0) this.endRelay();
    this.world.sort("depth");
  }

  /** 交代のしぶき（次の泳者が飛び込んだ合図）。 */
  private relayTakeoverFx(ln: RelayLane): void {
    const p = isoToWorld(SWIM_START, ln.lane);
    const fx = this.add
      .particles(0, 0, "spark", {
        x: this.world.x + p.x * this.world.scaleX,
        y: this.world.y + p.y * this.world.scaleY,
        speed: { min: 20, max: 60 },
        lifespan: 350,
        scale: { start: 1.3, end: 0 },
        quantity: 6,
        tint: [0x9be7ff, 0xffffff],
        emitting: false,
      })
      .setDepth(400);
    fx.explode(6);
    this.time.delayedCall(500, () => fx.destroy());
  }

  /** リレーが終わった。 */
  private endRelay(): void {
    if (this.stageDone) return;
    this.stageDone = true;
    this.done = true;
    this.skipBtn?.destroy();
    this.skipBtn = undefined;
    const relay = this.relay;
    if (!relay) return;
    if (relay.won) bgm.playJingle("fanfare");
    this.statusText
      .setText(relay.won ? "🏆 日本代表 優勝！" : `日本代表 ${relay.outcome.rank}位`)
      .setColor(relay.won ? "#f7dc6f" : "#ecf0f1");

    // 自クラブの選手ぶんだけ祝う（チームの成績なので、1人1回）
    for (const e of relay.entries) {
      this.celebrate.push({
        icon: relay.won ? "🏆" : "🇯🇵",
        title: relay.won ? `${e.student.name} 世界一！` : `${e.student.name} 日本代表`,
        subtitle: `${STROKE_LABEL[e.stroke]} ${RELAY_DISTANCE}m　${formatTime(e.time)}`,
        color: relay.won ? "#f7dc6f" : "#8fd0ff",
        portrait: ensurePortrait(this, e.student),
        burst: relay.won,
        durationSec: MEET_CELEBRATE_SEC.win,
      });
    }
    this.time.delayedCall(700, () => this.showRelayResultPanel());
  }

  /** リレーの結果（順位表と取り分）。 */
  private showRelayResultPanel(): void {
    const relay = this.relay;
    if (!relay) return;
    const teams = relay.outcome.teams;
    const rowH = 30;
    const headH = 96;
    const tailH = 112;
    const ph = Math.min(GAME_HEIGHT - 60, headH + teams.length * rowH + tailH);
    const pw = GAME_WIDTH - 32;
    const px = 16;
    const py = (GAME_HEIGHT - ph) / 2;

    const cont = this.add.container(0, 0).setDepth(500);
    cont.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive());
    const box = this.add.graphics();
    box.fillStyle(0x14263a, 1);
    box.fillRoundedRect(px, py, pw, ph, 12);
    box.lineStyle(3, 0x2e4a66, 1);
    box.strokeRoundedRect(px, py, pw, ph, 12);
    cont.add(box);

    const mk = (
      x: number,
      y: number,
      str: string,
      size: number,
      color: string,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const tx = this.add
        .text(x, y, str, {
          fontFamily: "sans-serif",
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(originX, 0);
      cont.add(tx);
      return tx;
    };

    mk(GAME_WIDTH / 2, py + 14, "400mメドレーリレー", 19, "#f7dc6f", true, 0.5);
    const head = mk(
      GAME_WIDTH / 2,
      py + 42,
      relay.won ? "日本代表が世界一になった" : `日本代表は ${relay.outcome.rank}位`,
      15,
      relay.won ? "#f7dc6f" : "#ecf0f1",
      true,
      0.5,
    );
    setJaWrap(head, pw - 40);
    mk(
      GAME_WIDTH / 2,
      py + 66,
      `${relay.outcome.gender === "f" ? "女子" : "男子"}　自クラブから ${relay.entries.length}人が出場`,
      12.5,
      "#9fb3c4",
      false,
      0.5,
    );

    let y = py + headH;
    teams.forEach((team, i) => {
      const mineLegs = team.legs.filter((l) => l.student != null).length;
      const color = team.isPlayer ? "#f7dc6f" : i < 3 ? "#d8dde3" : "#9fb3c4";
      mk(px + 16, y, `${i + 1}位`, 13, color, team.isPlayer);
      mk(px + 58, y, team.name, 13.5, color, team.isPlayer);
      mk(px + 190, y, formatTime(team.total), 13.5, color, team.isPlayer);
      if (team.isPlayer) mk(px + 286, y, `自クラブ ${mineLegs}人`, 11.5, "#8fd0ff");
      y += rowH;
    });

    y += 6;
    mk(px + 16, y, `◆ ${relay.totalGems}　人気 +${relay.totalPopularity}　🔥 +${Math.round(relay.passion)}`, 14, "#7fd1ae", true);

    const btn = new Button(this, GAME_WIDTH / 2, py + ph - 34, 220, 44, "施設へ戻る", () => this.exit(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 16,
    });
    btn.setDepth(501);
    cont.add(btn);
  }

  // ---------------------------------------------------------------- 構築

  private buildTopBar(): void {
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x102437, 1);
    g.fillRect(0, 0, GAME_WIDTH, 60);
    this.add
      .text(GAME_WIDTH / 2, 18, this.meta.comp.name, {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: COLORS.textAccent,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(101);
    const ev = this.meta.event;
    const n = this.meta.students.length;
    // リレーは種目が決まっている（4×100mメドレー）ので、出場人数もチームの人数で書く
    const card = this.meta.dayCard ?? [];
    const idx = card.findIndex((c) => c.current);
    const progress = card.length > 1 && idx >= 0 ? `［${idx + 1} / ${card.length}レース］　` : "";
    const sub = this.relay
      ? `400mメドレーリレー　日本代表（自クラブ ${this.relay.entries.length}人）`
      : `${progress}${ev.distance}m ${STROKE_LABEL[ev.stroke]}　自クラブ ${n}人が出場`;
    this.add
      .text(GAME_WIDTH / 2, 42, sub, { fontFamily: "sans-serif", fontSize: "13px", color: COLORS.textDim })
      .setOrigin(0.5)
      .setDepth(101);
  }

  private buildScoreboard(): void {
    const x = 16;
    const y = 70;
    const w = GAME_WIDTH - 32;
    const h = 196;
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x061019, 1);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0x1f6feb, 0.6);
    g.strokeRoundedRect(x, y, w, h, 8);

    this.stageText = this.add
      .text(x + 12, y + 8, "◼ 電光掲示板", { fontFamily: "monospace", fontSize: "14px", color: "#39d353" })
      .setDepth(101);

    // 8行（順位・名前・タイム）。最初は空欄。
    for (let i = 0; i < MEET_LANE_COUNT; i++) {
      const line = this.add
        .text(x + 14, y + 34 + i * 19, `${i + 1}.`, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#2b6b3a",
        })
        .setDepth(101);
      this.boardLines.push(line);
    }

    this.statusText = this.add
      .text(GAME_WIDTH / 2, y + h + 14, "", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: COLORS.textAccent,
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 40 },
      })
      .setOrigin(0.5, 0)
      .setDepth(101);
  }

  private buildVenue(): void {
    this.world = this.add.container(0, 0);

    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const COLS = POOL_LEN + 2; // deck 両端
    const ROWS = MEET_LANE_COUNT + 2; // deck 上下

    // 会場（床・ロープ・観客席）は動かないので、一度だけ描いて1枚の絵に焼く。
    // Phaser の Graphics は毎フレーム描画命令をやり直すため、
    // そのまま持つと 500 個近い多角形塗りが毎フレーム走ってレースがカクつく。
    const g = this.add.graphics();

    const diamond = (gx: number, gy: number, color: number): void => {
      const p = isoToWorld(gx, gy);
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(p.x, p.y - hh);
      g.lineTo(p.x + hw, p.y);
      g.lineTo(p.x, p.y + hh);
      g.lineTo(p.x - hw, p.y);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, 0x000000, 0.06);
      g.strokePath();
    };

    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const isWater = gy >= 1 && gy <= MEET_LANE_COUNT && gx >= 1 && gx <= POOL_LEN;
        if (isWater) {
          diamond(gx, gy, gy % 2 === 0 ? COLORS.poolWaterAlt : COLORS.poolWater);
        } else {
          diamond(gx, gy, (gx + gy) % 2 === 0 ? COLORS.deckAlt : COLORS.deck);
        }
      }
    }

    // レーンロープ（8レーン→7本＋外側2本）
    for (let l = 0; l <= MEET_LANE_COUNT; l++) {
      const by = l + 0.5;
      let toggle = 0;
      for (let gx = 0.6; gx <= POOL_LEN + 0.4; gx += 0.3) {
        const p = isoToWorld(gx, by);
        g.fillStyle(toggle % 2 === 0 ? 0xe74c3c : 0xf4f6f7, 1);
        g.fillCircle(p.x, p.y, 1.8);
        toggle++;
      }
    }

    // 観客席（奥側 row 0 に一段高いスタンド＋観客ドット）。
    // 泳者は必ず gy>=1（深度1050以上）なので、床と一緒に焼いても前後は狂わない。
    this.drawStands(g);

    this.bakeVenue(g, COLS, ROWS);

    // 泳者だけは毎レース作り直すので、専用の入れ物に分ける
    this.laneLayer = this.add.container(0, 0);
    this.world.add(this.laneLayer);

    // レーン番号（左デッキ）
    for (let l = 0; l < MEET_LANE_COUNT; l++) {
      const p = isoToWorld(0, l + 1);
      const t = this.add
        .text(p.x, p.y, String(l + 1), { fontFamily: "monospace", fontSize: "12px", color: "#ffffff" })
        .setOrigin(0.5)
        .setAlpha(0.85)
        .setDepth(depthFor(0, l + 1, 5));
      this.world.add(t);
    }

    this.fitWorld(COLS, ROWS);
  }

  /**
   * 会場の絵を RenderTexture に焼き付けて world に置く。
   * 焼けない端末では Graphics のまま残す（重いが表示は同じ）。
   */
  private bakeVenue(g: Phaser.GameObjects.Graphics, COLS: number, ROWS: number): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const pad = 6;
    const x = (0 - (ROWS - 1)) * hw - hw - pad;
    const y = -hh - STAND_RISE - pad; // 観客席は row 0 より上に伸びる
    const w = Math.ceil((COLS - 1) * hw + hw + pad - x);
    const h = Math.ceil((COLS - 1 + (ROWS - 1)) * hh + hh + pad - y);

    const made: Phaser.GameObjects.RenderTexture[] = [];
    try {
      for (const c of bakeChunks({ x, y, w, h })) {
        const rt = this.add.renderTexture(c.x, c.y, c.w, c.h).setOrigin(0, 0).setDepth(-1_000_000);
        rt.draw(g, -c.x, -c.y);
        made.push(rt);
      }
    } catch {
      for (const rt of made) rt.destroy();
      made.length = 0;
    }

    if (made.length > 0) {
      for (const rt of made) this.world.add(rt);
      g.destroy();
    } else {
      g.setDepth(-1_000_000);
      this.world.add(g);
    }
  }

  private drawStands(stand: Phaser.GameObjects.Graphics): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const riseH = STAND_RISE;
    // row 0 の帯を一段持ち上げた立体（奥の観客席）
    for (let gx = 0; gx < POOL_LEN + 2; gx++) {
      const p = isoToWorld(gx, 0);
      const topY = p.y - riseH;
      // 前面
      stand.fillStyle(0x274b6b, 1);
      stand.beginPath();
      stand.moveTo(p.x - hw, p.y);
      stand.lineTo(p.x, p.y + hh);
      stand.lineTo(p.x, p.y + hh - riseH);
      stand.lineTo(p.x - hw, p.y - riseH);
      stand.closePath();
      stand.fillPath();
      stand.fillStyle(0x2f5b80, 1);
      stand.beginPath();
      stand.moveTo(p.x, p.y + hh);
      stand.lineTo(p.x + hw, p.y);
      stand.lineTo(p.x + hw, p.y - riseH);
      stand.lineTo(p.x, p.y + hh - riseH);
      stand.closePath();
      stand.fillPath();
      // 天面
      stand.fillStyle(0x3a6f9c, 1);
      stand.beginPath();
      stand.moveTo(p.x, topY - hh);
      stand.lineTo(p.x + hw, topY);
      stand.lineTo(p.x, topY + hh);
      stand.lineTo(p.x - hw, topY);
      stand.closePath();
      stand.fillPath();
      // 観客ドット
      const seatColors = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0xffffff, 0xe67e22, 0x9b59b6];
      for (let k = 0; k < 3; k++) {
        stand.fillStyle(seatColors[(gx + k) % seatColors.length], 1);
        stand.fillCircle(p.x - hw / 2 + k * (hw / 2), topY - 2 - (k % 2) * 2, 1.8);
      }
    }
  }

  private fitWorld(COLS: number, ROWS: number): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const minWX = (0 - (ROWS - 1)) * hw - hw;
    const maxWX = (COLS - 1) * hw + hw;
    const minWY = 0 - 48;
    const maxWY = (COLS - 1 + (ROWS - 1)) * hh + hh + 14;

    const stageTop = 330;
    const stageBottom = GAME_HEIGHT - 70;
    const stageH = stageBottom - stageTop;
    const scale = Math.min(GAME_WIDTH / (maxWX - minWX), stageH / (maxWY - minWY));

    const cx = (minWX + maxWX) / 2;
    const cy = (minWY + maxWY) / 2;
    this.world.setScale(scale);
    this.world.setPosition(GAME_WIDTH / 2 - cx * scale, stageTop + stageH / 2 - cy * scale);
  }

  // ---------------------------------------------------------------- レース

  private racersFor(stage: Stage): Racer[] {
    const o = this.result.outcome;
    const list = stage === "final" ? o.final : o.heat;
    return (list ?? []).slice(0, MEET_LANE_COUNT);
  }

  private startStage(stage: Stage): void {
    this.stage = stage;
    this.stageDone = false;
    this.started = false;
    this.elapsed = 0;
    this.finishOrder = [];
    this.nextBtn?.destroy();
    this.nextBtn = undefined;

    // 前のレースの泳者を片付ける
    this.laneLayer.removeAll(true);
    this.lanes = [];

    const racers = this.racersFor(stage);
    const stageLabel = stage === "final" ? "決勝" : "予選";
    this.stageText.setText(`◼ ${stageLabel}`).setColor(stage === "final" ? "#f7dc6f" : "#39d353");

    const times = racers.map((r) => r.time);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = Math.max(0.001, max - min);

    // コースはレースごとにシャッフルする（結果順に並べると優勝者が丸わかりになる）
    const lanes = shuffledLanes(racers.length, () => Math.random());

    racers.forEach((racer, i) => {
      const gy = lanes[i] ?? i + 1;
      // 自クラブの選手は本人の年代で（中高生と大人で体つきが違う）。ライバルは中高生扱い。
      const entrant = racer.studentId != null ? this.meta.students.find((s) => s.id === racer.studentId) : undefined;
      const body = entrant ? bodyForStage(lifeStageOf(entrant.grade)) : "teen";
      // 見た目のタイプは性別とIDで決まる（施設画面と同じ人が泳ぐ）
      const variant = entrant
        ? variantForGender(entrant.gender === "f" ? "f" : "m", entrant.id)
        : variantForGender(i % 2 === 0 ? "m" : "f", i * 7 + 3);
      // 【大会はどの種目でも同じ泳ぎの絵】泳法ごとの絵は見え方がそろっておらず、
      // 並んで泳ぐと種目によって絵がばらついて見えていた。会場では体型ごとに1つの絵にそろえる。
      const swimMode: CharMode = body === "kid" || body === "child" ? "swim" : "swimFree";
      const typeId = charTypeOf(body, variant).id;
      const sprite = this.add
        .sprite(0, 0, charTexture(swimMode, body, variant, typeId))
        .setOrigin(0.5, 0.62)
        .setDepth(depthFor(SWIM_START, gy, 50));
      // 会場は縮小表示なので、施設より気持ち大きめ。
      // 描き起こした素材が入っていれば、その解像度に合わせた倍率で、泳ぎも動く。
      applyCharSprite(sprite, swimMode, body, variant, typeId, CHAR_SCALE * 1.15);
      // 【向きをそろえる】泳者はみな画面の右（ゴール）へ進む。素材は種類によって左向き・右向きが
      // 混ざっているので、向き表（→ gfx/charFacing.ts）を見て反転する。見ないと頭と逆へ進む子が出る。
      sprite.setFlipX(flipXFor(charFacing(typeId, swimMode), 1));
      this.laneLayer.add(sprite);

      let ring: Phaser.GameObjects.Ellipse | undefined;
      if (racer.isPlayer) {
        // 自クラブの選手が複数いるので、全員にリングを付けて見分けられるようにする
        ring = this.add
          .ellipse(0, 0, TILE_W * 0.6, TILE_H * 0.9, 0xffffff, 0)
          .setStrokeStyle(2, 0xf7dc6f, 1)
          .setDepth(depthFor(SWIM_START, gy, 49));
        this.laneLayer.add(ring);
      }

      // 完泳時間：順位を反映しつつ見やすく（5.0〜7.2秒）
      const norm = (racer.time - min) / span;
      const duration = 5.0 + 2.2 * norm;

      const ln: Lane = { racer, lane: gy, sprite, duration, progress: 0, finished: false, ring };
      this.lanes.push(ln);
      this.placeSwimmer(ln, SWIM_START);
    });

    // 電光掲示板：スタート前は「コース順」に名前だけ薄く出す
    // （順位はゴールした順に updateBoard が上書きしていく）
    const byLane = [...this.lanes].sort((a, b) => a.lane - b.lane);
    this.boardLines.forEach((line, i) => {
      const ln = byLane[i];
      if (!ln) {
        line.setText("").setColor("#2b6b3a");
        return;
      }
      const tag = ln.racer.isPlayer ? "★" : " ";
      line.setText(`${ln.lane}コース ${tag}${ln.racer.name}`).setColor(ln.racer.isPlayer ? "#f7dc6f" : "#2b6b3a");
    });

    // カウントダウン → スタート
    this.statusText.setText(`${stageLabel}　位置について…`).setColor(COLORS.textAccent);
    // スタート前にスキップされたら、この予約は捨てる（→ raceSeq）
    const seq = ++this.raceSeq;
    this.time.delayedCall(1200, () => {
      if (this.done || this.stageDone || seq !== this.raceSeq) return;
      this.statusText.setText("スタート！");
      this.started = true;
      this.time.delayedCall(800, () => {
        if (!this.stageDone && seq === this.raceSeq) this.statusText.setText("");
      });
    });
  }

  private placeSwimmer(ln: Lane, gx: number): void {
    const gy = ln.lane; // 並び順ではなく、割り当てたコース番号に置く
    const p = isoToWorld(gx, gy);
    ln.sprite.setPosition(p.x, p.y).setDepth(depthFor(gx, gy, 50));
    if (ln.ring) ln.ring.setPosition(p.x, p.y + 3).setDepth(depthFor(gx, gy, 49));
  }

  private onFinish(ln: Lane, quiet: boolean): void {
    const rank = this.finishOrder.length;
    // フィニッシュの水しぶき（スキップ時は大量に出さない）
    if (!quiet) {
      const fx = this.add
        .particles(0, 0, "spark", {
          x: this.world.x + ln.sprite.x * this.world.scaleX,
          y: this.world.y + ln.sprite.y * this.world.scaleY,
          speed: { min: 20, max: 70 },
          lifespan: 400,
          scale: { start: 1.6, end: 0 },
          quantity: 8,
          tint: [0x9be7ff, 0xffffff],
          emitting: false,
        })
        .setDepth(200);
      fx.explode(8);
      this.time.delayedCall(500, () => fx.destroy());
    }

    // 電光掲示板を更新（順位・コース番号・名前・タイム）
    const line = this.boardLines[rank - 1];
    if (!line) return;
    const tag = ln.racer.isPlayer ? "★" : " ";
    line
      .setText(`${rank}. L${ln.lane} ${tag}${ln.racer.name} ${formatTime(ln.racer.time)}`)
      .setColor(ln.racer.isPlayer ? "#f7dc6f" : rank <= 3 ? "#39d353" : "#8fb7a0");
  }

  /** そのレースが終わった。予選なら決勝へ、決勝（または進出者なし）なら結果へ。 */
  private endStage(): void {
    if (this.stageDone) return;
    this.stageDone = true;
    // 決勝がまだなら次の組のために残す。終わりならボタンごと消す
    if (this.stage === "final" || !this.result.outcome.final) {
      this.skipBtn?.destroy();
      this.skipBtn = undefined;
    }

    const o = this.result.outcome;
    if (this.stage === "heat" && o.final) {
      const up = o.entrants.filter((e) => e.advanced);
      const names = up.map((e) => e.name).join("・");
      this.statusText
        .setText(names ? `予選通過：${names}\n決勝へ進出！` : "予選終了")
        .setColor("#f7dc6f");
      this.nextBtn = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 40, 220, 44, "決勝へ ▶", () => this.startStage("final"), {
        color: 0x8e6a2f,
        hoverColor: 0xb8893c,
        fontSize: 16,
      });
      this.nextBtn.setDepth(300);
      return;
    }

    if (this.stage === "heat") {
      // 誰も決勝に上がれなかった
      this.statusText.setText("予選敗退").setColor("#e59866");
    } else {
      const best = this.result.best;
      const won = best?.entrant.win ?? false;
      this.statusText.setText(won ? "🏆 優勝！" : (best?.reward.placementLabel ?? "")).setColor(won ? "#f7dc6f" : "#ecf0f1");
      if (won) bgm.playJingle("fanfare"); // 優勝のファンファーレ
    }
    this.done = true;
    // 【努力が報われる瞬間を見せる】記録更新と表彰を、顔つきの演出で順に出す。
    // 演出は短く、画面タップでいつでも飛ばせる（→ gfx/Celebration.ts）。
    this.celebrateResults();
    this.time.delayedCall(700, () => this.showResultPanel());
  }

  // ---------------------------------------------------------------- 演出

  /**
   * レース後のお祝いを順に積む。
   *
   * 大会新記録 → 自己新記録 → 表彰（優勝・2位・3位）の順。
   * 積むだけなので、CelebrationLayer が1つずつ短く出してくれる。
   * 「勝てなくても記録は伸びた」が見えることを大事にしているので、
   * **入賞していなくても自己新記録は必ず祝う**。
   */
  private celebrateResults(): void {
    const ev = this.meta.event;
    for (const e of this.result.entries) {
      const face = ensurePortrait(this, e.student);
      const time = formatTime(e.entrant.bestTime);
      if (e.meetRecord) {
        this.celebrate.push({
          icon: "🏅",
          title: "大会新記録！",
          subtitle: `${e.student.name}　${ev.distance}m ${STROKE_LABEL[ev.stroke]}　${time}`,
          color: "#ff6bcb",
          portrait: face,
          burst: true,
          durationSec: MEET_CELEBRATE_SEC.record,
        });
      } else if (e.selfBest) {
        /**
         * 【何秒縮んだかを出す】能力の数字はゆっくりしか動かないので、
         * 成長の手ごたえは「前の自己ベストから何秒速くなったか」で見せる。
         * 初めてのタイム（前の記録が無い）ときは差を出さず「初記録」と書く。
         */
        const diff = e.prevBestSec > 0 ? e.prevBestSec - e.entrant.bestTime : 0;
        const delta = e.prevBestSec > 0 ? `　−${diff.toFixed(2)}秒` : "　（初記録）";
        this.celebrate.push({
          icon: "⏱",
          title: "自己新記録達成！",
          subtitle: `${e.student.name}　${ev.distance}m ${STROKE_LABEL[ev.stroke]}　${time}${delta}`,
          color: "#f7dc6f",
          portrait: face,
          burst: true,
          durationSec: MEET_CELEBRATE_SEC.record,
        });
      }
    }
    // 表彰は上位から（同じレースに複数人出していても、入賞したぶんだけ出る）
    const podium = this.result.entries
      .filter((e) => e.entrant.finalRank != null && e.entrant.finalRank <= 3)
      .sort((a, b) => (a.entrant.finalRank ?? 9) - (b.entrant.finalRank ?? 9));
    for (const e of podium) {
      const rank = e.entrant.finalRank as number;
      const look = PODIUM[rank];
      if (!look) continue;
      this.celebrate.push({
        icon: look.icon,
        title: `${look.label}　${e.student.name}`,
        subtitle: `${this.meta.comp.name}　${ev.distance}m ${STROKE_LABEL[ev.stroke]}`,
        color: look.color,
        portrait: ensurePortrait(this, e.student),
        burst: rank === 1,
        durationSec: rank === 1 ? MEET_CELEBRATE_SEC.win : MEET_CELEBRATE_SEC.podium,
      });
    }
  }

  // ---------------------------------------------------------------- 結果

  private showResultPanel(): void {
    const { entries, best, totalGems, totalPopularity, entryCost, passion, mayorPrize } = this.result;

    const rowH = 40;
    const headH = 108;
    // 祝い金の1行を足すぶん、下の余白を広げる（足さないと下のボタンに重なる）
    /**
     * 【大型施設の効果を見せる】大型プール・低酸素トレーニングルームで縮んだ秒数（いちばん大きかった人）。
     * 建てても違いが分からない、と言われたので、レースのたびに1行立てて数字で出す。
     */
    const cut = entries.reduce((m, e) => Math.max(m, e.facilityCutSec ?? 0), 0);
    const showCut = cut > 0.005;
    const tailH = 118 + (mayorPrize > 0 ? 22 : 0) + (showCut ? 22 : 0);
    const ph = Math.min(GAME_HEIGHT - 80, headH + entries.length * rowH + tailH);
    const pw = GAME_WIDTH - 32;
    const px = 16;
    const py = (GAME_HEIGHT - ph) / 2;

    const cont = this.add.container(0, 0).setDepth(500);
    const bg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setInteractive();
    cont.add(bg);
    const box = this.add.graphics();
    box.fillStyle(0x14263a, 1);
    box.fillRoundedRect(px, py, pw, ph, 12);
    box.lineStyle(3, 0x2e4a66, 1);
    box.strokeRoundedRect(px, py, pw, ph, 12);
    cont.add(box);

    const mk = (
      x: number,
      y: number,
      s: string,
      size: number,
      color: string,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.add
        .text(x, y, s, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
        .setOrigin(originX, 0);
      cont.add(t);
      return t;
    };

    const cx = GAME_WIDTH / 2;
    const ev = this.meta.event;
    mk(cx, py + 14, `${this.meta.comp.name}　${ev.distance}m ${STROKE_LABEL[ev.stroke]}`, 14, "#bdc3c7", true, 0.5);

    const won = best?.entrant.win ?? false;
    mk(cx, py + 38, best?.reward.placementLabel ?? "出場なし", 26, won ? "#f7dc6f" : "#ecf0f1", true, 0.5);
    if (best && entries.length > 1) {
      mk(cx, py + 72, `最上位：${best.student.name}`, 12.5, "#9fb3c4", false, 0.5);
    }

    // 出場した選手ぶんの明細（予選→決勝の順位・タイム・報酬）
    let y = py + headH;
    for (const e of entries) {
      this.buildEntryRow(cont, mk, px, y, pw, e, best?.entrant.studentId === e.entrant.studentId);
      y += rowH;
    }

    // 出場費を引いた「差し引き」まで出す（大きい大会ほど出場費が高いので、
    // 勝てない大会に人数を並べると赤字になることが分かるように）
    const net = totalGems + mayorPrize - entryCost;
    mk(
      cx,
      y + 6,
      `賞金 ◆ +${totalGems}　出場費 ◆ -${entryCost}　→ 差し引き ◆ ${net >= 0 ? "+" : ""}${net}　` +
        `人気度 +${totalPopularity}` +
        (passion > 0 ? `　🔥 情熱 +${Math.round(passion)}` : ""),
      14,
      net >= 0 ? "#2ecc71" : "#e67e22",
      true,
      0.5,
    );
    /**
     * 【市長からの祝い金】優勝したときだけ出る、クラブのいちばん大きな収入。
     * 賞金と同じ行に混ぜると埋もれるので、**1行立てて**額をそのまま見せる。
     */
    if (mayorPrize > 0) {
      mk(cx, y + 26, `🎉 市長からの祝い金 ◆ +${mayorPrize.toLocaleString()}`, 15, "#f7dc6f", true, 0.5);
    }
    // 【下に積む】祝い金を出したぶんだけ、次の行（突破したもの）を下げる。
    // 固定の位置に書いていたころ、祝い金と「次のステージへ」が同じ高さで重なっていた
    let noteY = y + (mayorPrize > 0 ? 52 : 30);
    if (showCut) {
      mk(cx, noteY - 4, `🏟 大型施設の効果　タイム −${cut.toFixed(2)}秒`, 13, "#7fd8f0", true, 0.5);
      noteY += 22;
    }

    // 突破したもの（次のステージ・参加標準記録）
    const notes: string[] = [];

    for (const e of entries) {
      // どの種目で勝ち上がったのかを書く（次の段はその種目でしか出られない）
      if (e.reward.qualifiedNext) {
        notes.push(`🏆 ${e.student.name} が ${STROKE_LABEL[ev.stroke]}${ev.distance}m で次のステージへ！`);
      }
      // どの標準を破ったのかを名前で出す（小学生標準と日本選手権標準では重みが違う）
      for (const k of e.reward.newStandards) {
        notes.push(`◎ ${e.student.name} が${STANDARD_LABEL[k]}を突破！`);
      }
    }
    if (notes.length > 0) {
      const nt = mk(cx, noteY, "", 12.5, "#f7dc6f", true, 0.5);
      setJaWrap(nt, pw - 40); // 日本語は既定の折り返しでは止まらない（→ ui/textWrap.ts）
      nt.setText(notes.slice(0, 2).join("　"));
    }

    const close = new Button(this, cx, py + ph - 28, 210, 42, "会場をあとにする", () => this.exit(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 15,
    });
    close.setDepth(501);
    cont.add(close);
  }

  private buildEntryRow(
    cont: Phaser.GameObjects.Container,
    mk: (x: number, y: number, s: string, size: number, color: string, bold?: boolean, originX?: number) => Phaser.GameObjects.Text,
    px: number,
    y: number,
    pw: number,
    e: CompetitionEntryResult,
    isBest: boolean,
  ): void {
    const rect = this.add
      .rectangle(px + pw / 2, y + 17, pw - 28, 34, isBest ? 0x24506b : 0x1c3550, 1)
      .setStrokeStyle(1, isBest ? 0xf7dc6f : 0x2e4a66, 1);
    cont.add(rect);

    mk(px + 24, y + 3, e.student.name, 14, "#ecf0f1", true);
    const rank = e.entrant.finalRank != null ? `予選${e.entrant.heatRank}位 → 決勝${e.entrant.finalRank}位` : `予選${e.entrant.heatRank}位`;
    mk(px + 24, y + 20, rank, 11, "#9fb3c4");

    mk(px + pw - 24, y + 3, formatTime(e.entrant.bestTime), 14, "#aed6f1", true, 1);
    // 【壁の手前の「あと少し」を見せる】勝てなかった選手には1位とのタイム差を出す。
    // どれだけ足りないのかが分かると、合宿・特別練習・コーチのどれに手を入れるか決められる。
    const gap = e.entrant.gapToWinner;
    if (!e.entrant.win && gap > 0) {
      const stage = e.entrant.gapStage === "final" ? "決勝" : "予選";
      const close = gap < MEET_CLOSE_GAP;
      mk(
        px + pw - 24,
        y + 20,
        // 1位になるには、その秒数だけ**縮める**必要がある＝マイナスで書く（+ だと遅くなる向きに読める）
        `${stage}1位まで −${gap.toFixed(2)}秒${close ? "（あと少し）" : ""}　◆+${e.reward.gems}`,
        11,
        close ? "#f7dc6f" : "#9fb3c4",
        false,
        1,
      );
    } else {
      mk(px + pw - 24, y + 20, `◆+${e.reward.gems}`, 11, "#2ecc71", false, 1);
    }
  }

  private exit(): void {
    if (this.exited) return; // 2回目の押下は無視（→ exited）
    this.exited = true;
    this.meta.onClose();
    this.scene.resume("Facility");
    this.scene.stop();
  }
}
