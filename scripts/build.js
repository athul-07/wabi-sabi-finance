const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

async function main() {
  const root = path.join(__dirname, '..');
  await build({
    absWorkingDir: root,
    entryPoints: ['src/frontend.jsx'],
    bundle: true,
    minify: true,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile: 'public/app.js',
  });
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'src/styles.css', '-o', 'public/app.css', '--minify'], { cwd: root, stdio: 'inherit' });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
