import { _electron as electron } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'build/icons');
const iconset = path.join(directory, 'mark.iconset');
await mkdir(iconset, { recursive: true });
const source = await readFile(path.join(directory, 'mark.svg'), 'utf8');
const app = await electron.launch({ args: [path.join(root, 'scripts/icon-window.cjs')] });
try {
  const page = await app.firstWindow();
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    // At small sizes omit paper hairlines; broaden ink slightly and simplify the accent.
    let svg = source;
    if (size <= 64) svg = svg.replace(/<g id="paper-detail"[\s\S]*?<\/g>/, '');
    if (size <= 32) {
      svg = svg.replace('id="monogram"', 'stroke="#38654D" stroke-width="10" stroke-linejoin="round" id="monogram"');
      svg = svg.replace(/<path id="accent"[^>]*\/>/, '');
    }
    const data = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, size });
    const bytes = Buffer.from(data, 'base64');
    await writeFile(path.join(directory, `mark-${size}.png`), bytes);
    for (const points of [16, 32, 128, 256, 512]) {
      if (size === points) await writeFile(path.join(iconset, `icon_${points}x${points}.png`), bytes);
      if (size === points * 2) await writeFile(path.join(iconset, `icon_${points}x${points}@2x.png`), bytes);
    }
  }
  const sizes = [256, 128, 64, 32, 16];
  const sources = await Promise.all(sizes.map(async size => ({ size, url: `data:image/png;base64,${(await readFile(path.join(directory, `mark-${size}.png`))).toString('base64')}` })));
  await page.setViewportSize({ width: 1120, height: 740 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,sans-serif}.row{height:370px;padding:34px 44px;display:flex;align-items:center;justify-content:space-between;gap:25px}.light{background:#faf9f6;color:#303b38}.dark{background:#182332;color:#d6e0ec}.item{text-align:center;min-width:75px}.label{font-size:12px;opacity:.7;margin-top:12px}img{display:block;margin:auto}</style>${['light','dark'].map(theme=>`<div class="row ${theme}">${sources.map(({size,url})=>`<div class="item"><img src="${url}" width="${size}" height="${size}"><div class="label">${size} px</div></div>`).join('')}</div>`).join('')}`);
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await page.screenshot({ path: path.join(directory, 'preview.png') });
} finally { await app.close(); }
execFileSync('/usr/bin/iconutil', ['--convert', 'icns', '--output', path.join(directory, 'mark.icns'), iconset]);
console.log('Generated Mark PNGs and complete macOS ICNS in build/icons.');
