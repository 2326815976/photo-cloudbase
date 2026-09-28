const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// 执行真实模块，仅在 I/O 边界替换依赖；每次加载独立缓存，避免测试互相污染。
module.exports = function loadTypeScript(entry, mocks = {}) {
  const root = path.resolve(__dirname, '../..');
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const execute = vm.runInThisContext(`(function(require, module, exports) {\n${compiled}\n})`, { filename });
    execute((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      const resolved = name.startsWith('@/')
        ? path.resolve(root, name.slice(2))
        : path.resolve(path.dirname(filename), name);
      const target = ['', '.ts', '.tsx', '.js'].map((ext) => resolved + ext).find((value) => fs.existsSync(value) && fs.statSync(value).isFile());
      if (!target) throw new Error(`Cannot resolve ${name} from ${filename}`);
      return load(target);
    }, module, module.exports);
    return module.exports;
  }
  return load(path.resolve(root, entry));
};
