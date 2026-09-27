import { canPlaceAt, landBounds, placedRooms } from "../sim/clubMap";
import { footprintOf, ROOM_ORDER } from "../sim/equipment";
import type { GameState } from "../sim/state";
import { STAFF_ORDER } from "../sim/staff";

/**
 * 見た目確認用に「部屋が全種類そろった施設」を作る（開発ビルド限定）。
 *
 * 床の描き分け・内壁・部屋名の札は、その部屋が建っていないと確かめようがない。
 * かといって、確かめるたびに本編を遊んで建てていくのは現実的でないので、
 * ?dev=facility&full=1 のときだけ、ゲームと同じ手続き（買う → 自動配置 → 道を繋ぐ）で
 * 一気に建ててしまう。**本編の建設処理をそのまま呼ぶ**ので、
 * ここで見えている絵は実際に遊んで到達できる絵と同じになる。
 */
export function buildShowcase(state: GameState): void {
  // 全部建てるだけの資金と土地を用意する（見た目確認なので、収支は見ない）
  state.gems += 20_000_000;
  // 敷地は買えるだけ買う。大型施設（大型プール18×12・アスリート寮12×7）は
  // 後ろの部屋から順に置いていくと**場所が足りずに買えない**（買えなかったことは
  // 画面に出ないので、「建っていない部屋がある」と気づけない）。
  while (state.expandLand().ok) state.gems += 20_000_000;
  /**
   * 【大型施設は「格」と「在籍」で鍵が掛かっている】（→ UNLOCK）
   * 大型プール・医科学センター・高地トレーニング棟は、格5〜6・在籍60〜80人が要る。
   * 見た目の確認のためだけに本編を何十年も遊ぶわけにいかないので、
   * ここでクラブを「世界の名門」相当にしてから建てる。
   */
  state.popularity = 6000;
  state.clubAchievement = 40000;
  state.refreshClubRank();
  while (state.totalMembers() < 90) state.addDevMember();
  // 【大きい部屋から先に建てる】ROOM_ORDER の順だと大型プール（18×12）が最後のほうになり、
  // 敷地が埋まって**建たないまま**になっていた（撮っても大型プールが写らない）。
  const BIG_FIRST = ["pool10", "dorm", "science", "altitudeLab"];
  const order = [...ROOM_ORDER].sort((a, b) => Number(BIG_FIRST.includes(b)) - Number(BIG_FIRST.includes(a)));
  for (const kind of order) {
    if (kind === "entrance") continue; // 玄関は最初から1つある
    state.buyEquipment(kind);
    state.gems += 2_000_000;
  }
  // グレードのある部屋は「大」まで上げる（器具でびっしりの状態を見るため）
  for (const room of state.gradableRooms()) {
    while (state.upgradeRoom(room).ok) state.gems += 2_000_000;
  }
  // 一般客が来ている賑わいも確かめたいので、人気度を上げておく
  // （温浴施設の「複数人がくつろいでいる」絵は、客が来ないと出てこない）。
  state.addPopularity(600);
  // 専門スタッフも雇っておく（栄養士は食堂の配膳、ドクターはドクタールームに立つ）。
  // 雇っていないと、その部屋を撮っても人がいない絵しか出てこない。
  for (const kind of STAFF_ORDER) {
    state.gems += 2_000_000;
    state.hireStaff(kind);
  }
}

/**
 * ?dev=facility&rot=1：建っている部屋を、置ける限り「回した向き」に置き直す（開発ビルド限定）。
 *
 * 回した部屋（縦横を入れ替えた部屋）の床・壁・什器・レーンが合っているかは、
 * 実際に回した絵を撮らないと確かめられない。本編と同じ placeRoom を使うので、
 * ここで見えている絵は遊んで回したときの絵と同じになる。
 * その場で回せなければ近い空きへ移す（通路をふさぐ場所・歩いて行けない場所には置かない）。
 */
export function rotateShowcase(state: GameState): number {
  // 全部建てた施設はぎっしりで回す余地が無いので、敷地を最大まで広げて空きを作る
  //（拡張は右と上に足すだけで、建っている部屋は動かない）
  state.gems += 2_000_000;
  while (state.expandLand().ok) state.gems += 2_000_000;
  let turned = 0;
  for (const room of placedRooms(state.map())) {
    if (room.kind === "entrance" || room.gx == null || room.gy == null) continue;
    const map = state.map();
    const b = landBounds(map);
    const f = footprintOf(room.kind, 1);
    const cands: { gx: number; gy: number; d: number }[] = [];
    for (let gy = b.y0; gy + f.h - 1 <= b.y1; gy++) {
      for (let gx = b.x0; gx + f.w - 1 <= b.x1; gx++) {
        cands.push({ gx, gy, d: Math.abs(gx - room.gx) + Math.abs(gy - room.gy) });
      }
    }
    cands.sort((a, c) => a.d - c.d);
    for (const c of cands) {
      // 重なりだけ先に安く見て、残った候補だけ通路の判定（幅優先探索）にかける
      if (!canPlaceAt(map, room.kind, c.gx, c.gy, room.id, 1).ok) continue;
      const check = state.checkPlacement(room.kind, c.gx, c.gy, room.id, 1);
      if (!check.ok || check.warning) continue;
      if (state.placeRoom(room, c.gx, c.gy, false, 1).ok) turned++;
      break;
    }
  }
  return turned;
}
