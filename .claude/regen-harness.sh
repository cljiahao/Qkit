#!/usr/bin/env bash
# HUMAN-RUN ONLY. Rewrites origin_hash in .claude/harness.json to the current files.
# NEVER let an agent run this — regenerating the baseline masks the drift the verifier
# exists to catch. protect-files.sh requires human approval to edit harness.json itself.
#
# Hashes the blob git has stored at HEAD for each path, not the working-tree file — a
# raw disk read is not portable: Windows checkouts with core.autocrlf=true silently
# rewrite LF blobs to CRLF on checkout, producing a baseline that mismatches on any
# fresh Linux/CI checkout of the same commit. Matches verify-harness.sh's sha().
set -euo pipefail
if command -v node >/dev/null 2>&1; then
  node -e 'const fs=require("fs"),cr=require("crypto"),{execSync}=require("child_process"),j=JSON.parse(fs.readFileSync(".claude/harness.json","utf8"));for(const v of Object.values(j.seeded_files)){try{const buf=execSync(`git show HEAD:${JSON.stringify(v.path)}`,{maxBuffer:10*1024*1024});v.origin_hash=cr.createHash("sha256").update(buf).digest("hex");}catch(e){}}fs.writeFileSync(".claude/harness.json",JSON.stringify(j,null,2)+"\n");console.log("harness baseline regenerated");'
elif command -v python3 >/dev/null 2>&1; then
  python3 -c 'import json,hashlib,subprocess;j=json.load(open(".claude/harness.json"));[v.__setitem__("origin_hash",hashlib.sha256(subprocess.run(["git","show","HEAD:"+v["path"]],capture_output=True).stdout).hexdigest()) for v in j["seeded_files"].values()];open(".claude/harness.json","w").write(json.dumps(j,indent=2)+"\n");print("harness baseline regenerated")'
else
  echo "regen-harness: need node or python3" >&2; exit 3
fi
chmod +x .claude/verify-harness.sh .claude/regen-harness.sh
