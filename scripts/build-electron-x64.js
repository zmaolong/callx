const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('node:child_process');

const webSource = path.join('packages', 'bruno-app', 'dist');
const electronWeb = path.join('packages', 'bruno-electron', 'web');

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', shell: true });
}

function prepareWeb() {
  fs.removeSync(electronWeb);
  fs.ensureDirSync(electronWeb);
  fs.copySync(webSource, electronWeb);

  for (const file of fs.readdirSync(electronWeb)) {
    if (file.endsWith('.html')) {
      const filePath = path.join(electronWeb, file);
      const content = fs.readFileSync(filePath, 'utf8');
      fs.writeFileSync(filePath, content.replace(/\/static/g, './static'));
    }
  }

  const cssDir = path.join(electronWeb, 'static', 'css');
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir)) {
      if (file.endsWith('.css')) {
        const filePath = path.join(cssDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        fs.writeFileSync(filePath, content.replace(/\/static\/font/g, '../../static/font'));
      }
    }
  }

  for (const file of fs.readdirSync(electronWeb)) {
    if (file.endsWith('.map')) {
      fs.removeSync(path.join(electronWeb, file));
    }
  }
}

try {
  console.log('Building the web app from the current source');
  run('npm run build:web');
  fs.removeSync(path.join('packages', 'bruno-electron', 'out'));
  prepareWeb();
  run('npm run dist:win --workspace=packages/bruno-electron -- --config electron-builder-x64-config.js');
  console.log('\n x64 installer created at packages/bruno-electron/out/bruno_2.0.0_x64_win.exe');
} catch (error) {
  console.error('\nBuild failed:', error.message);
  process.exitCode = 1;
}
