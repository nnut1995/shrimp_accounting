import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT, DATA } from './core.mjs';
if (process.platform !== 'darwin') throw new Error('This installer is for macOS.');
const label = 'com.natn.shrimp-discord-bot';
const home = os.homedir();
const dir = path.join(home, 'Library/LaunchAgents');
const target = path.join(dir, `${label}.plist`);
const pm2 = path.join(path.dirname(process.execPath), 'pm2');
await access(pm2);
const escape = v => v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const args = [process.execPath, pm2, 'start', path.join(ROOT, 'scripts/discord-bot/ecosystem.config.cjs')];
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(a=>`<string>${escape(a)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${escape(ROOT)}</string>
<key>RunAtLoad</key><true/>
<key>EnvironmentVariables</key><dict><key>HOME</key><string>${escape(home)}</string><key>PATH</key><string>${escape(path.dirname(process.execPath))}:${escape(path.join(home,'.local/bin'))}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>StandardOutPath</key><string>${escape(path.join(DATA,'startup.log'))}</string>
<key>StandardErrorPath</key><string>${escape(path.join(DATA,'startup-error.log'))}</string>
</dict></plist>`;
await mkdir(dir,{recursive:true});await mkdir(DATA,{recursive:true,mode:0o700});
await writeFile(target,plist,{mode:0o600});
execFileSync('/usr/bin/plutil',['-lint',target],{stdio:'inherit'});
console.log(`Installed ${target}. Loads only this bot, without replacing other PM2 saved processes.`);
