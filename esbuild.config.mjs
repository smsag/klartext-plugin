import esbuild from "esbuild";
import { builtinModules } from "node:module";

const prod = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  banner: { js: "/* Klartext plugin — bundled by esbuild; the source is in src/. */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  // What Obsidian provides at runtime. A second, bundled copy of CodeMirror
  // would make its extensions fail Obsidian's own instanceof checks, so every
  // @codemirror and @lezer package stays outside, whether imported today or not.
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
