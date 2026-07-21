// Node 전용 — 브라우저 Canvas 없이 draw 함수를 실행해 그리기 호출을 기록하는 테스트 더블.
// (테스트 인프라이므로 이 파일 자체는 red/green 사이클 대상이 아니다.)
"use strict";

var CTX_METHODS = [
  "save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "stroke",
  "fill", "arc", "rect", "clip", "setLineDash", "fillText", "fillRect",
  "clearRect", "setTransform"
];

function createStubCtx() {
  var calls = [];
  var ctx = { calls: calls };
  CTX_METHODS.forEach(function (name) {
    ctx[name] = function () {
      calls.push({ name: name, args: Array.prototype.slice.call(arguments) });
    };
  });
  ctx.measureText = function (text) { return { width: String(text).length * 8 }; };
  ["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "font",
    "textAlign", "textBaseline", "globalAlpha"].forEach(function (prop) {
    ctx[prop] = "";
  });
  return ctx;
}

function createStubCanvas(width, height) {
  var ctx = createStubCtx();
  return {
    width: width, height: height,
    style: {}, dataset: {},
    getContext: function () { return ctx; },
    _ctx: ctx
  };
}

function fillTextCalls(ctx) {
  return ctx.calls.filter(function (c) { return c.name === "fillText"; })
    .map(function (c) { return c.args[0]; });
}

function hasCall(ctx, name, argsPredicate) {
  return ctx.calls.some(function (c) {
    return c.name === name && (!argsPredicate || argsPredicate(c.args));
  });
}

module.exports = {
  createStubCanvas: createStubCanvas,
  fillTextCalls: fillTextCalls,
  hasCall: hasCall
};
