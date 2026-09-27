/**
 * 検証スクリプト（node 実行）用の Phaser の代わり。
 *
 * gfx/textures.ts などは `new Phaser.Math.Vector2()` のように Phaser を値として使うので、
 * ヘッドレスで people.ts を動かすときに本物の phaser を読み込もうとして失敗する。
 * 検証では絵を描く関数を呼ばないので、**型を満たすだけの空の器**を渡せば足りる。
 *
 * 使い方（esbuild）:
 *   npx esbuild movecheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs
 */

class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

const Phaser = {
  Math: { Vector2, Between: (a, b) => a, Clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
  Textures: { FilterMode: { NEAREST: 0, LINEAR: 1 } },
  Display: { Color: class {} },
  Geom: {},
  GameObjects: {},
  Utils: { Array: {} },
  Scene: class {},
  Scale: { FIT: 0, CENTER_BOTH: 0 },
  AUTO: 0,
};

export default Phaser;
