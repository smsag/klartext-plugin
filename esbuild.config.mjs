import esbuild from "esbuild";

const prod = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  banner: { js: "/* Klartext plugin — bundled by esbuild; the source is in src/. */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
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
