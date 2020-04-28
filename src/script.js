// 3次元。3Dfigures.

// ステップ1:4つの係数からモニック4次方程式の実数解を
// vec4形式で取得する（ない場合はどうせ使わない-1.0で補間して返す）
// ステップ2:4つの係数をトーラスの情報から構成する関数を作る
// （ここをいじれば他の4次曲面でも同じようにできるはず）
// 余談だけど多分メンガースポンジは一定距離ずつ進むレイマで書いてそう
// ステップ3:実数解ベクトルの成分のうち正で最小のものをtとして採用。
// これでgetTorus()の返り値とする。

let myShader;

let vs =
"precision mediump float;" +
"attribute vec3 aPosition;" +
"void main(void){" +
"  gl_Position = vec4(aPosition, 1.0);" +
"}";

let fs =
"precision mediump float;" +
"uniform vec2 u_resolution;" +
"uniform vec2 u_mouse;" +
"uniform float u_time;" +
// yawとcameraPosはuniformにして操作可能に
"uniform float yaw;" +
"uniform vec2 cameraPos;" +
"uniform float cameraHeight;" +
// 円周率
"const float pi = 3.14159;" +
// 光源。
"const vec3 c_sun = vec3(300.0, 100.0, 300.0);" +
"const float r_sun = 20.0;" +
// hsbで書かれた(0.0～1.0)の数値vec3をrgbに変換する魔法のコード
"vec3 getHSB(float h, float s, float b){" +
"  vec3 c = vec3(h, s, b);" +
"  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);" +
"  rgb = rgb * rgb * (3.0 - 2.0 * rgb);" +
"  return c.z * mix(vec3(1.0), rgb, c.y);" +
"}" +
// fromEulerの独自修正版。(roll, pitch, yaw)で取得する。
"mat3 fromEuler(float roll, float pitch, float yaw){" +
"  vec2 a = vec2(cos(roll), sin(roll));" +
"  vec2 b = vec2(cos(pitch), sin(pitch));" +
"  vec2 c = vec2(cos(yaw), sin(yaw));" +
// 画面の横揺れ（roll）
"  mat3 m_roll;" +
"  m_roll[0] = vec3(a.x, a.y, 0.0);" +
"  m_roll[1] = vec3(-a.y, a.x, 0.0);" +
"  m_roll[2] = vec3(0.0, 0.0, 1.0);" +
// 縦揺れ（pitch）
"  mat3 m_pitch;" +
"  m_pitch[0] = vec3(1.0, 0.0, 0.0);" +
"  m_pitch[1] = vec3(0.0, b.x, b.y);" +
"  m_pitch[2] = vec3(0.0, -b.y, b.x);" +
// 水平回転（yaw）
"  mat3 m_yaw;" +
"  m_yaw[0] = vec3(c.x, 0.0, c.y);" +
"  m_yaw[1] = vec3(0.0, 1.0, 0.0);" +
"  m_yaw[2] = vec3(-c.y, 0.0, c.x);" +
// m_roll, m_pitch, m_yawの順に適用される
"  return m_yaw * m_pitch * m_roll;" +
"}" +
// 双曲線関数
"float cosh(float x){" +
"  return 0.5 * (exp(x) + exp(-x));" +
"}" +
"float sinh(float x){" +
"  return 0.5 * (exp(x) - exp(-x));" +
"}" +
// v1, v2, alphaに対し、v1*cos(alpha)+v2*sin(alpha)を返す。
"vec3 combo(vec3 v1, vec3 v2, float alpha){" +
"  return v1 * cos(alpha) + v2 * sin(alpha);" +
"}" +
// 色のライティング処理
// bltが0.0に近いほど黒っぽく、1.0に近いほど白っぽく。うまくいった。
// 引数に対象となる点pとそこにおける法線normalを加えましょうか。
// 同じこといくつも書きたくないし。
"vec3 getLighting(vec3 p, vec3 normal, vec3 mainColor){" +
"  vec3 sunRay = normalize(c_sun - p);" +
"  float blt = max(0.0, dot(normal, sunRay));" +
// bltに応じて暗くしたり明るくしたりする。
"  return mix(mainColor * blt, vec3(1.0), 1.0 - sqrt(1.0 - blt * blt));" +
"}" +
// タイルカラー
"vec3 getTileColor(vec2 u, float hue){" +
"  vec2 i = floor(u);" +
"  vec2 f = fract(u);" +
// 座標軸を暗くする
"  vec2 dark = smoothstep(-0.05, 0.0, u) - smoothstep(0.0, 0.05, u);" +
"  vec3 color;" +
// 2種類のタイルの色
"  vec3 tile1 = getHSB(hue, 0.4, 1.0);" +
"  vec3 tile2 = getHSB(hue, 0.1, 1.0);" +
// 隣接タイルが違う色になるように
"  color = tile1 + mod(i.x + i.y, 2.0) * (tile2 - tile1);" +
// 軸付近では暗くなるように
"  color = mix(color, vec3(0.0), min(dark.x + dark.y, 1.0));" +
"  return color;" +
"}" +
"vec3 getSkyColor(vec3 ori, vec3 dir){" +
"  float y = dir.y + 0.05;" +
"  vec3 sky = getHSB(0.55, sqrt(y * (2.0 - y)), 1.0);" +
"  float tmp = dot(dir, c_sun - ori);" +
"  float distWithSun = length(c_sun - ori - tmp * dir);" +
"  float ratio = 1.0;" +
"  if(distWithSun > r_sun){ ratio = r_sun / distWithSun; }" +
"  vec3 sun = vec3(1.0, 0.9, 0.85);" +
"  return mix(sky, sun, ratio);" +
"}" +
"vec3 getBackground(vec3 ori, vec3 dir){" +
"  if(dir.y > -0.05){" +
"    return getSkyColor(ori, dir);" +
"  }" +
"  float t = -ori.y / dir.y;" +
"  vec2 u = ori.xz + t * dir.xz;" +
"  return getTileColor(u, 0.33);" +
"}" +
// 4x^3 - 3qx = rの解を求める。
"float getSub(float q, float r){" +
// rが0とみなせるならふつうに0.0やらqの平方根でやる。
"  if(abs(r) < 1e-10){" +
"    if(q < 0.0){ return 0.0; }" +
"    return 0.5 * sqrt(3.0 * q);" +
"  }" +
// 以降、|r|>0とする。符号をとっておく。
"  float sign_r = sign(r);" +
// qが0とみなせるなら3乗根を取ればよい
"  if(abs(q) < 1e-10){" +
"    return sign_r * pow(0.25 * abs(r), 1.0 / 3.0);" +
"  }" +
// 以降は|r|>0かつ|q|>0とする。
"  float d = r * r - q * q * q;" +  // 判別式
// この辺りの処理ではxの係数を変数変換で1にしている
"  float cf = sqrt(abs(q));" +
"  float h = abs(r) / pow(cf, 3.0);" +
// まず判別式が負の場合は三角関数解が得られる
"  if(d < 0.0){" +
"    float alpha = acos(sign_r * h) / 3.0;" +
"    return cf * cos(alpha);" +
"  }" +
// 判別式が0以上の場合は実数解はひとつなのでそれを
// 双曲線関数を用いて取得する
// qが正の時はコサインハイポ
"  if(q > 0.0){" +
"    float x = log(h + sqrt(h * h - 1.0)) / 3.0;" +
// rが負の時はマイナスを付ける
"    return sign_r * cf * cosh(x);" +
"  }" +
// qが負の時はサインハイポ
"  float x = log(h + sqrt(h * h + 1.0)) / 3.0;" +
"  return sign_r * cf * sinh(x);" +
"}" +
// 4次方程式の実数解を取得するパート。
// x^4 + 4(k3)x^3 + 4(k2)x^2 + 8(k1)x + 4(k0) = 0の解を求める
"vec4 solve4(float k3, float k2, float k1, float k0){" +
// あらかじめ-1.0で埋めておいて解が見つかったら置き換える感じ。
// どうせ正の数しか使わないでしょ
"  vec4 ans = vec4(-1.0);" +
// 変数変換してx^3の係数をなくす処理
// 具体的には解の和が0になるようにグラフの平行移動をしている
"  float c2 = (2.0 * k2 - 3.0 * k3 * k3) / 3.0;" +
"  float c1 = 2.0 * (k3 * k3 * k3 - k2 * k3 + k1);" +
"  float c0 = (-3.0 * pow(k3, 4.0) + 4.0 * k3 * k3 * k2 - 8.0 * k1 * k3 + 4.0 * k0) / 3.0;" +
// c1が0とみなせるなら退化として計算
"  if(abs(c1) < 1e-10){" +
"    if(3.0 * c2 * c2 < c0){ return ans; }" +
"    float beta = sqrt(9.0 * c2 * c2 - 3.0 * c0);" +
"    float alpha = -3.0 * c2;" +
"    if(alpha + beta >= 0.0){" +
"      ans.x = sqrt(alpha + beta) - k3;" +
"      ans.y = -sqrt(alpha + beta) - k3;" +
"    }" +
"    if(alpha - beta >= 0.0){" +
"      ans.z = sqrt(alpha - beta) - k3;" +
"      ans.w = -sqrt(alpha - beta) - k3;" +
"    }" +
"    return ans;" +
"  }" +
// 以下では|c1| > 0.0とする。続きは、帰ってから（えー）
"  float q = c0 + c2 * c2;" +
"  float r = c1 * c1 + c2 * c2 * c2 - 3.0 * c0 * c2;" +
// q, rに対して4x^3 - qx = rの解のうち最大の実数値を取る
"  float w = getSub(q, r);" +
// するとv = w - c2が正の数になる
"  float v = w - c2;" +
// vと係数から解を出す
"  float j = sqrt(v);" +
"  float h = c1 / j;" +
// 判別式
"  float d1 = -v - 3.0 * c2 - h;" +
"  float d2 = -v - 3.0 * c2 + h;" +
"  if(d1 >= 0.0){" +
"    d1 = sqrt(d1);" +
"    ans.x = j + d1 - k3;" +
"    ans.y = j - d1 - k3;" +
"  }" +
"  if(d2 >= 0.0){" +
"    d2 = sqrt(d2);" +
"    ans.z = -j + d2 - k3;" +
"    ans.w = -j - d2 - k3;" +
"  }" +
"  return ans;" +
"}" +
// トーラス。
// cは中心、nは法線ベクトル、aは軸半径、bは胴体半径。
"float getTorus(vec3 ori, vec3 dir, vec3 c, vec3 n, float a, float b){" +
// まずk3, k2, k1, k0を出す。
"  float q0 = dot(ori - c, ori - c);" +
"  float q1 = dot(ori - c, dir);" +
"  float q2 = pow(dot(ori - c, n), 2.0);" +
"  float q3 = dot(ori - c, n) * dot(dir, n);" +
"  float q4 = pow(dot(dir, n), 2.0);" +
"  float k = 0.5 * (q0 - a * a - b * b);" +
"  float k3 = q1;" +
"  float k2 = k + q1 * q1 + a * a * q4;" +
"  float k1 = q1 * k + a * a * q3;" +
"  float k0 = k * k - a * a * b * b + a * a * q2;" +
"  vec4 ans = solve4(k3, k2, k1, k0);" +
"  if(ans.x < 0.0 && ans.y < 0.0 && ans.z < 0.0 && ans.w < 0.0){ return -1.0; }" +
"  float t = 1e20;" +
"  if(ans.x >= 0.0){ t = min(t, ans.x); }" +
"  if(ans.y >= 0.0){ t = min(t, ans.y); }" +
"  if(ans.z >= 0.0){ t = min(t, ans.z); }" +
"  if(ans.w >= 0.0){ t = min(t, ans.w); }" +
"  return t;" +
"}" +
// 法線取得(pはトーラス上であることを仮定）
// 一般の4次曲面ではこうするしかないわけですが・・
// 方程式F(x) = (x^2 + y^2 + z^2 + a^2 - b^2)^2 - 4a^2(x^2 + y^2) = 0
// に対して関数Fのナブラベクトル∇F(p)の正規化を取っていますね。
// 傾きを考慮してないので普通にやりましょうね。
"vec3 getNormalOfTorus(vec3 p, vec3 c, vec3 n, float a, float b){" +
"  vec3 q = c + normalize((p - c) - dot(p - c, n) * n) * a;" +
// bで割るとかインチキしないで普通に正規化しましょう。
"  return normalize(p - q);" +
"}" +
// tが取得できたのでトーラスを描画します。法線はどうしよう・・
// out忘れてた。描画できたが・・むぅぅ。
"void drawTorus(out vec4 drawer, vec3 ori, vec3 dir, vec3 c, vec3 n, float a, float b, vec3 bodyColor){" +
"  float t = getTorus(ori, dir, c, n, a, b);" +
"  if(t < 0.0 || t > drawer.w){ return; }" +
"  vec3 p = ori + t * dir;" +
"  vec3 normal = getNormalOfTorus(p, c, n, a, b);" +
"  vec3 torusColor = getLighting(p, normal, bodyColor);" +
"  drawer = vec4(torusColor, t);" +
"}" +
// ようやくメインコード
"void main(void){" +
"  vec2 st = (gl_FragCoord.xy - u_resolution.xy) / min(u_resolution.x, u_resolution.y);" +
"  float time = u_time * 2.7;" + // 実際に使うtime.
// roll（横揺れ）、pitch（縦揺れ）、yaw（視線方向）を作る
"  float phase = time * pi * 0.5;" +
"  float roll = sin(u_time * pi * 0.5) * pi * 0.05;" +
"  float pitch = (u_mouse.y / u_resolution.y - 0.75) * pi / 1.5;" +
// oriはカメラ位置、dirはピクセルに向かうベクトルの正規化（デフォは目の前1.6の所に-1.0～1.0）
"  float depth = 1.6;" +
"  vec3 ori = vec3(cameraPos.x, cameraHeight, cameraPos.y);" +
"  vec3 dir = normalize(vec3(st.xy, -depth));" +
// 変換行列で視界をいじってdirに補正を掛ける
"  dir = fromEuler(roll, pitch, yaw) * normalize(dir);" +
// まず背景色（床と軸と太陽）を取得。そこに上書きしていく。
"  vec3 color = getBackground(ori, dir);" +
// これ以降はcolorとtを一つ組にしたdrawerというのを用意して使い回す。
// 今までのtは第4成分となる感じ。
"  vec4 drawer = vec4(color, 99999.9);" +
"  float alpha = pi * 0.1;" +
"  float theta = u_time * pi;" +
"  vec3 c0 = vec3(0.0, 5.0, 0.0);" +
"  vec3 n0 = vec3(sin(alpha) * cos(theta), cos(alpha), sin(alpha) * sin(theta));" +
"  drawTorus(drawer, ori, dir, c0, n0, 10.0, 2.0, vec3(0.7));" +
"  gl_FragColor = vec4(drawer.xyz, 1.0);" +
"}";

let myCamera;
let looping = true;

function setup(){
  createCanvas(640, 360, WEBGL);
  myShader = createShader(vs, fs);
  shader(myShader);
  myCamera = new CameraModule();
}

function draw(){
  myShader.setUniform("u_resolution", [width, height]);
  myShader.setUniform("u_mouse", [constrain(mouseX, 0, width), height - constrain(mouseY, 0, height)]);
  myShader.setUniform("u_time", millis() / 1000);
  myCamera.update();
  myCamera.regist();
  quad(-1, -1, -1, 1, 1, 1, 1, -1);
}

class CameraModule{
  constructor(){
    this.cameraPos = createVector(20.0, 20.0);
    this.yaw = Math.PI;
    this.cameraSpeed = 0.3;
    this.cameraHeight = 2.0;
  }
  update(){
    this.yaw = constrain(mouseX / width, 0.0, 1.0) * 4.0 * Math.PI;
    if(mouseIsPressed){
      let velocity = createVector(sin(this.yaw), -cos(this.yaw)).mult(this.cameraSpeed);
      this.cameraPos.add(velocity);
    }
    if(keyIsDown(UP_ARROW)){ this.cameraHeight += 0.1; }
    else if(keyIsDown(DOWN_ARROW)){ this.cameraHeight -= 0.1; }
    this.cameraHeight = constrain(this.cameraHeight, 2.0, 12.0);
  }
  regist(){
    myShader.setUniform("yaw", this.yaw);
    myShader.setUniform("cameraPos", [this.cameraPos.x, this.cameraPos.y]);
    myShader.setUniform("cameraHeight", this.cameraHeight);
  }
}

// loop.
function keyTyped(){
  if(keyCode === 32){
  if(looping){ noLoop(); looping = false; }else{ loop(); looping = true; }
  }
}
