"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@radix-ui+react-use-callbac_3a59e5178e5d23716bde251e7dc7d4a8";
exports.ids = ["vendor-chunks/@radix-ui+react-use-callbac_3a59e5178e5d23716bde251e7dc7d4a8"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/@radix-ui+react-use-callbac_3a59e5178e5d23716bde251e7dc7d4a8/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs":
/*!**********************************************************************************************************************************************************!*\
  !*** ../../node_modules/.pnpm/@radix-ui+react-use-callbac_3a59e5178e5d23716bde251e7dc7d4a8/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs ***!
  \**********************************************************************************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   useCallbackRef: () => (/* binding */ useCallbackRef)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"(ssr)/../../node_modules/.pnpm/next@15.5.25_@types+node@25_a679bf865932c4bdca4d5b814e2b3495/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js\");\nvar __defProp = Object.defineProperty;\nvar __name = (target, value) => __defProp(target, \"name\", { value, configurable: true });\n\n// src/use-callback-ref.tsx\n\nfunction useCallbackRef(callback) {\n  const callbackRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(callback);\n  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {\n    callbackRef.current = callback;\n  });\n  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ((...args) => callbackRef.current?.(...args)), []);\n}\n__name(useCallbackRef, \"useCallbackRef\");\n\n//# sourceMappingURL=index.mjs.map\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0ByYWRpeC11aStyZWFjdC11c2UtY2FsbGJhY18zYTU5ZTUxNzhlNWQyMzcxNmJkZTI1MWU3ZGM3ZDRhOC9ub2RlX21vZHVsZXMvQHJhZGl4LXVpL3JlYWN0LXVzZS1jYWxsYmFjay1yZWYvZGlzdC9pbmRleC5tanMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQTtBQUNBLDREQUE0RCwyQkFBMkI7O0FBRXZGO0FBQytCO0FBQy9CO0FBQ0Esc0JBQXNCLHlDQUFZO0FBQ2xDLEVBQUUsNENBQWU7QUFDakI7QUFDQSxHQUFHO0FBQ0gsU0FBUywwQ0FBYTtBQUN0QjtBQUNBO0FBR0U7QUFDRiIsInNvdXJjZXMiOlsiQzpcXFVzZXJzXFxWaWpheVxcRG93bmxvYWRzXFxFbGVjdG9yYWwtUm9sbC1TZWFyY2hcXEVsZWN0b3JhbC1Sb2xsLVNlYXJjaFxcbm9kZV9tb2R1bGVzXFwucG5wbVxcQHJhZGl4LXVpK3JlYWN0LXVzZS1jYWxsYmFjXzNhNTllNTE3OGU1ZDIzNzE2YmRlMjUxZTdkYzdkNGE4XFxub2RlX21vZHVsZXNcXEByYWRpeC11aVxccmVhY3QtdXNlLWNhbGxiYWNrLXJlZlxcZGlzdFxcaW5kZXgubWpzIl0sInNvdXJjZXNDb250ZW50IjpbInZhciBfX2RlZlByb3AgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG52YXIgX19uYW1lID0gKHRhcmdldCwgdmFsdWUpID0+IF9fZGVmUHJvcCh0YXJnZXQsIFwibmFtZVwiLCB7IHZhbHVlLCBjb25maWd1cmFibGU6IHRydWUgfSk7XG5cbi8vIHNyYy91c2UtY2FsbGJhY2stcmVmLnRzeFxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCI7XG5mdW5jdGlvbiB1c2VDYWxsYmFja1JlZihjYWxsYmFjaykge1xuICBjb25zdCBjYWxsYmFja1JlZiA9IFJlYWN0LnVzZVJlZihjYWxsYmFjayk7XG4gIFJlYWN0LnVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY2FsbGJhY2tSZWYuY3VycmVudCA9IGNhbGxiYWNrO1xuICB9KTtcbiAgcmV0dXJuIFJlYWN0LnVzZU1lbW8oKCkgPT4gKCguLi5hcmdzKSA9PiBjYWxsYmFja1JlZi5jdXJyZW50Py4oLi4uYXJncykpLCBbXSk7XG59XG5fX25hbWUodXNlQ2FsbGJhY2tSZWYsIFwidXNlQ2FsbGJhY2tSZWZcIik7XG5leHBvcnQge1xuICB1c2VDYWxsYmFja1JlZlxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWluZGV4Lm1qcy5tYXBcbiJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOlswXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/@radix-ui+react-use-callbac_3a59e5178e5d23716bde251e7dc7d4a8/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs\n");

/***/ })

};
;