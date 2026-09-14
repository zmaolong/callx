const fs = require('fs');
const path = require('path');

const EXPECTED_VERSION = '4.2.6';
const ENTRY_FILES = [
  path.join('dist', 'tippy-react.esm.js'),
  path.join('dist', 'tippy-react.umd.js')
];
const OLD_REF_ACCESS = 'preserveRef(children.ref, node);';
const NEW_REF_ACCESS = 'preserveRef(children.props && children.props.ref, node);';

const projectRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(projectRoot, 'node_modules', '@tippyjs', 'react');
const packageJsonPath = path.join(packageRoot, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.version !== EXPECTED_VERSION) {
  console.log(`跳过 Tippy React 19 兼容补丁：检测到版本 ${packageJson.version}，预期版本为 ${EXPECTED_VERSION}。`);
  process.exit(0);
}

for (const relativePath of ENTRY_FILES) {
  const filePath = path.join(packageRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(OLD_REF_ACCESS)) {
    continue;
  }

  fs.writeFileSync(filePath, source.replaceAll(OLD_REF_ACCESS, NEW_REF_ACCESS));
  console.log(`已应用 Tippy React 19 ref 兼容补丁：${path.relative(projectRoot, filePath)}`);
}
