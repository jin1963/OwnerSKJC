/* owner.js — KJC Owner Console
 * ต้องมีไฟล์: config.js (ใส่ window.ADDR.CONTRACT, window.SALE_ABI, window.ERC20_MINI_ABI)
 * และ owner.html / style.css ตามที่ส่งให้
*/

let web3, provider, account;
let sale, usdt, kjc;

// --------- DOM helpers ----------
const el = (id)=>document.getElementById(id);
const nowSec = ()=> Math.floor(Date.now()/1000);

function toast(msg, type='info'){
  const box = el('toast');
  box.style.display='block';
  box.innerHTML = msg;
  box.style.borderColor = (type==='ok')? '#225b2a' : (type==='err')? '#5b2222' : '#1b1c25';
  setTimeout(()=>{ box.style.display='none'; }, 4000);
}
const fmtDate = ts => ts>0 ? new Date(Number(ts)*1000).toLocaleString() : '-';

// BigInt format/parse
function fmtBig(v, dec=18, dp=6){
  try{
    const s = BigInt(v).toString();
    if(dec===0) return s;
    const neg = s.startsWith('-');
    const raw = neg? s.slice(1): s;
    const pad = raw.padStart(dec+1,'0');
    const a = pad.slice(0, pad.length-dec);
    const b = pad.slice(pad.length-dec).replace(/0+$/,'');
    return (neg?'-':'') + (b? `${a}.${b.slice(0,dp)}`: a);
  }catch{ return v?.toString?.() ?? String(v); }
}
function toWeiAuto(numStr, dec=18){
  // รองรับ "123.45" หรือ "wei:123000000000000000000"
  const s = String(numStr).trim();
  if (s.toLowerCase().startsWith('wei:')) return s.slice(4).trim();
  if (!s.includes('.')) return (BigInt(s||'0') * (10n**BigInt(dec))).toString();
  const [i,d=''] = s.split('.');
  const frac = (d + '0'.repeat(dec)).slice(0,dec);
  return (BigInt(i||0)*(10n**BigInt(dec)) + BigInt(frac||0)).toString();
}

// --------- Connect ----------
async function connect(){
  try{
    provider = window.ethereum;
    if(!provider) return toast('ไม่พบ Web3 Provider/MetaMask', 'err');
    await provider.request({ method:'eth_requestAccounts' });
    web3 = new Web3(provider);

    const chainId = await web3.eth.getChainId();
    if (web3.utils.toHex(chainId) !== window.NETWORK.chainIdHex){
      await provider.request({ method:'wallet_switchEthereumChain', params:[{ chainId: window.NETWORK.chainIdHex }] });
    }

    account = (await web3.eth.getAccounts())[0];
    el('wallet').textContent = `✅ ${account.slice(0,6)}…${account.slice(-4)}`;
    el('ca').textContent = window.ADDR.CONTRACT;

    // instances
    sale = new web3.eth.Contract(window.SALE_ABI, window.ADDR.CONTRACT);
    usdt = new web3.eth.Contract(window.ERC20_MINI_ABI, window.ADDR.USDT);
    kjc  = new web3.eth.Contract(window.ERC20_MINI_ABI, window.ADDR.KJC);

    // listeners
    provider.on?.('accountsChanged', ()=>location.reload());
    provider.on?.('chainChanged',   ()=>location.reload());

    await bootstrapOwnerPanel();
  }catch(e){
    console.error(e);
    toast(`เชื่อมต่อไม่สำเร็จ: ${e?.message||e}`, 'err');
  }
}

async function bootstrapOwnerPanel(){
  try{
    // owner
    const owner = await sale.methods.owner().call();
    el('ownerAddr').textContent = owner;
    if (owner.toLowerCase() !== account.toLowerCase()){
      toast('คำเตือน: คุณไม่ใช่ Owner ของสัญญานี้ (ปุ่มเปลี่ยนค่าจะล้มเหลว)', 'err');
    }
  }catch{}
  await refreshPauseState();
  await refreshBalances();
  await loadParams();
  await loadPackages();
}

// --------- Pause / Unpause ----------
async function refreshPauseState(){
  try{
    const p = await sale.methods.paused().call();
    el('pausedState').textContent = p ? '⏸️ Paused' : '▶️ Running';
  }catch{
    el('pausedState').textContent = '(ไม่รองรับ paused())';
  }
}
async function doPause(){
  try{
    toast('กำลัง pause…');
    await sale.methods.pause().send({ from: account });
    toast('Paused ✅', 'ok');
    await refreshPauseState();
  }catch(e){ toast(`pause ล้มเหลว: ${e?.message||e}`, 'err'); }
}
async function doUnpause(){
  try{
    toast('กำลัง unpause…');
    await sale.methods.unpause().send({ from: account });
    toast('Unpaused ✅', 'ok');
    await refreshPauseState();
  }catch(e){ toast(`unpause ล้มเหลว: ${e?.message||e}`, 'err'); }
}

// --------- Balances + Withdraw ----------
async function refreshBalances(){
  try{
    const [uDec,kDec] = await Promise.all([
      usdt.methods.decimals?.().call().catch(()=>18),
      kjc.methods.decimals?.().call().catch(()=>18),
    ]);
    const [uBal,kBal] = await Promise.all([
      usdt.methods.balanceOf(window.ADDR.CONTRACT).call(),
      kjc.methods.balanceOf(window.ADDR.CONTRACT).call(),
    ]);
    el('balUSDT').textContent = `${fmtBig(uBal, Number(uDec))} USDT`;
    el('balKJC').textContent  = `${fmtBig(kBal, Number(kDec))} KJC`;
  }catch(e){
    el('balUSDT').textContent = '-';
    el('balKJC').textContent  = '-';
  }
}

async function ownerWithdrawUSDT(){
  try{
    const dec = Number(await usdt.methods.decimals?.().call().catch(()=>18));
    const amtStr = toWeiAuto(el('wdUsdtAmt').value || '0', dec);
    const to = el('wdUsdtTo').value.trim();
    if (!web3.utils.isAddress(to)) return toast('ที่อยู่ผู้รับ (to) ไม่ถูกต้อง', 'err');
    toast('กำลังโอน USDT…');
    await sale.methods.ownerWithdrawUSDT(amtStr, to).send({ from: account });
    toast('โอน USDT สำเร็จ ✅','ok');
    await refreshBalances();
  }catch(e){ toast(`โอน USDT ล้มเหลว: ${e?.message||e}`, 'err'); }
}

async function ownerWithdrawKJC(){
  try{
    const dec = Number(await kjc.methods.decimals?.().call().catch(()=>18));
    const amtStr = toWeiAuto(el('wdKjcAmt').value || '0', dec);
    const to = el('wdKjcTo').value.trim();
    if (!web3.utils.isAddress(to)) return toast('ที่อยู่ผู้รับ (to) ไม่ถูกต้อง', 'err');
    toast('กำลังโอน KJC…');
    await sale.methods.ownerWithdrawKJC(amtStr, to).send({ from: account });
    toast('โอน KJC สำเร็จ ✅','ok');
    await refreshBalances();
  }catch(e){ toast(`โอน KJC ล้มเหลว: ${e?.message||e}`, 'err'); }
}

// --------- Params ----------
async function loadParams(){
  try{
    const [
      apr, claimStake, lockDur,
      r1, r2, r3, refInt
    ] = await Promise.all([
      sale.methods.REWARD_APR_BPS().call(),
      sale.methods.CLAIM_INTERVAL_STAKE().call(),
      sale.methods.LOCK_DURATION().call(),
      sale.methods.REF1_BPS().call(),
      sale.methods.REF2_BPS().call(),
      sale.methods.REF3_BPS().call(),
      sale.methods.REF_CLAIM_INTERVAL().call()
    ]);

    el('p_apr').value           = apr;
    el('p_claimIntStake').value = claimStake;
    el('p_lockDur').value       = lockDur;
    el('p_ref1').value          = r1;
    el('p_ref2').value          = r2;
    el('p_ref3').value          = r3;
    el('p_refClaimInt').value   = refInt;

    el('paramsView').textContent =
      `APR=${apr}bps | stakeInt=${claimStake}s | lock=${lockDur}s | ref(1/2/3)=${r1}/${r2}/${r3}bps | refClaimInt=${refInt}s`;
  }catch(e){
    el('paramsView').textContent = 'อ่านพารามิเตอร์ไม่ได้';
  }
}

async function setParams(){
  try{
    const apr      = el('p_apr').value.trim();
    const cStake   = el('p_claimIntStake').value.trim();
    const lock     = el('p_lockDur').value.trim();
    const r1       = el('p_ref1').value.trim();
    const r2       = el('p_ref2').value.trim();
    const r3       = el('p_ref3').value.trim();
    const rClaim   = el('p_refClaimInt').value.trim();

    if (![apr,cStake,lock,r1,r2,r3,rClaim].every(x=>x!=='')) return toast('กรอกค่าพารามิเตอร์ให้ครบ', 'err');

    toast('กำลังบันทึกพารามิเตอร์…');
    await sale.methods.setParams(
      apr, cStake, lock, r1, r2, r3, rClaim
    ).send({ from: account });
    toast('บันทึกพารามิเตอร์สำเร็จ ✅','ok');
    await loadParams();
  }catch(e){
    toast(`setParams ล้มเหลว: ${e?.message||e}`, 'err');
  }
}

// --------- Packages ----------
async function loadPackages(){
  const list = el('pkgList');
  list.innerHTML = 'กำลังโหลด…';
  try{
    const count = await sale.methods.packageCount().call();
    el('pkgCount').textContent = count;
    const usdtDec = Number(await usdt.methods.decimals?.().call().catch(()=>18));
    const kjcDec  = Number(await kjc.methods.decimals?.().call().catch(()=>18));

    let html = '';
    // สัญญาปัจจุบันเริ่ม index 0 (ตาม constructor)
    for (let i=0; i<Number(count); i++){
      const p = await sale.methods.packages(i).call();
      html += `
        <div class="row between pkgRow">
          <div>#${i}</div>
          <div>USDT: <span class="mono">${fmtBig(p.usdtIn, usdtDec)}</span></div>
          <div>KJC: <span class="mono">${fmtBig(p.kjcOut, kjcDec)}</span></div>
          <div>active: <b>${p.active?'true':'false'}</b></div>
        </div>
      `;
    }
    list.innerHTML = html || '<div class="muted">ไม่มีแพ็กเกจ</div>';
  }catch(e){
    console.error(e);
    list.innerHTML = 'โหลดแพ็กเกจไม่สำเร็จ';
  }
}

async function setPackage(){
  try{
    const id   = el('pkgId').value.trim();
    const uStr = el('pkgUsdt').value.trim();
    const kStr = el('pkgKjc').value.trim();
    const act  = el('pkgActive').value === 'true';

    if (id==='') return toast('ใส่ id แพ็กเกจ', 'err');

    const usdtDec = Number(await usdt.methods.decimals?.().call().catch(()=>18));
    const kjcDec  = Number(await kjc.methods.decimals?.().call().catch(()=>18));
    const usdtIn  = uStr ? toWeiAuto(uStr, usdtDec) : '0';
    const kjcOut  = kStr ? toWeiAuto(kStr, kjcDec) : '0';

    toast('กำลังบันทึกแพ็กเกจ…');
    await sale.methods.setPackage(id, usdtIn, kjcOut, act).send({ from: account });
    toast('บันทึกแพ็กเกจสำเร็จ ✅','ok');
    await loadPackages();
  }catch(e){
    toast(`setPackage ล้มเหลว: ${e?.message||e}`, 'err');
  }
}

// --------- Airdrop Stakes ----------
function parseAirdropList(raw){
  // รูปแบบ: "0xabc..., 1500" ต่อบรรทัด
  const lines = String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const rows = [];
  for (const ln of lines){
    const [addr, amtStrRaw] = ln.split(',').map(x=>x.trim());
    if (!addr || !amtStrRaw) throw new Error(`รูปแบบบรรทัดไม่ถูกต้อง: ${ln}`);
    rows.push({ addr, amt: amtStrRaw });
  }
  return rows;
}

async function previewAirdrop(){
  try{
    const rows = parseAirdropList(el('airdropList').value);
    const kjcDec = Number(await kjc.methods.decimals?.().call().catch(()=>18));
    const amountsWei = rows.map(r => toWeiAuto(r.amt, kjcDec));
    const sum = amountsWei.reduce((a,b)=> (a + BigInt(b)), 0n);
    el('airdropPreview').textContent = `${rows.length} รายการ | รวม ~ ${fmtBig(sum, kjcDec)} KJC`;
    toast('แปลงรายการเรียบร้อย ✅','ok');
  }catch(e){ toast(`แปลงไม่สำเร็จ: ${e?.message||e}`, 'err'); }
}

async function runAirdrop(){
  try{
    const rows = parseAirdropList(el('airdropList').value);
    const kjcDec = Number(await kjc.methods.decimals?.().call().catch(()=>18));
    const users = [];
    const amounts = [];
    for (const r of rows){
      if (!web3.utils.isAddress(r.addr)) throw new Error(`address ไม่ถูกต้อง: ${r.addr}`);
      users.push(r.addr);
      amounts.push(toWeiAuto(r.amt, kjcDec));
    }
    let startTime = el('airdropStart').value.trim();
    if (startTime==='') startTime = String(nowSec());

    toast(`กำลังส่งธุรกรรม Airdrop (${users.length} ราย)…`);
    await sale.methods.airdropStakes(users, amounts, startTime).send({ from: account });
    toast('Airdrop สำเร็จ ✅','ok');
  }catch(e){ toast(`Airdrop ล้มเหลว: ${e?.message||e}`, 'err'); }
}

// --------- Query User ----------
async function queryUser(){
  const out = el('qResult');
  out.innerHTML = 'กำลังอ่าน…';
  try{
    const addr = el('qAddr').value.trim();
    if (!web3.utils.isAddress(addr)) return (out.textContent='address ไม่ถูกต้อง');

    const n = await sale.methods.getStakeCount(addr).call();
    if (Number(n)===0){ out.textContent='ไม่มี stake'; return; }

    let html = '';
    for (let i=0;i<Number(n);i++){
      const s   = await sale.methods.stakes(addr, i).call();
      const nct = await sale.methods.nextStakeClaimTime(addr, i).call();
      const can = await sale.methods.canUnstake(addr, i).call();
      const pr  = await sale.methods.pendingStakeReward(addr, i).call();

      html += `
        <div class="row between">
          <div>#${i}</div>
          <div>Principal: <span class="mono">${fmtBig(s.amount, 18)}</span> KJC</div>
          <div>Start: ${fmtDate(s.startTime)}</div>
          <div>NextClaim: ${fmtDate(nct)}</div>
          <div>Pending: <span class="mono">${fmtBig(pr, 18)}</span> KJC</div>
          <div>Withdrawn: ${s.withdrawn? 'true':'false'}</div>
          <div>CanUnstake: ${can? '✅':'-'}</div>
        </div>
      `;
    }
    out.innerHTML = html;
  }catch(e){
    out.textContent = `อ่านข้อมูลไม่สำเร็จ: ${e?.message||e}`;
  }
}

// --------- Wire UI ----------
window.addEventListener('DOMContentLoaded', ()=>{
  el('btnConnect').addEventListener('click', connect);
  el('btnPause').addEventListener('click', doPause);
  el('btnUnpause').addEventListener('click', doUnpause);

  el('btnWdUsdt').addEventListener('click', ownerWithdrawUSDT);
  el('btnWdKjc').addEventListener('click', ownerWithdrawKJC);

  el('btnLoadParams').addEventListener('click', loadParams);
  el('btnSetParams').addEventListener('click', setParams);

  el('btnReloadPkgs').addEventListener('click', loadPackages);
  el('btnSetPkg').addEventListener('click', setPackage);

  el('btnParseAirdrop').addEventListener('click', previewAirdrop);
  el('btnRunAirdrop').addEventListener('click', runAirdrop);

  el('btnQueryUser').addEventListener('click', queryUser);
});
