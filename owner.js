let web3, account, contract;

// === เชื่อมกระเป๋า ===
async function connectWallet() {
  try {
    const provider =
      window.ethereum ||
      window.bitkeep?.ethereum ||
      window.okxwallet?.ethereum ||
      window.bitget?.ethereum;

    if (!provider) {
      alert("❌ ไม่พบกระเป๋า (MetaMask, Bitget, OKX)");
      return;
    }

    await provider.request({ method: "eth_requestAccounts" });
    web3 = new Web3(provider);
    const accounts = await web3.eth.getAccounts();
    account = accounts[0];

    const chainId = await provider.request({ method: "eth_chainId" });
    if (chainId !== window.NETWORK.chainIdHex) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: window.NETWORK.chainIdHex }]
      });
    }

    contract = new web3.eth.Contract(window.SALE_ABI, window.ADDR.CONTRACT);

    document.getElementById("wallet").textContent =
      `✅ ${account.slice(0,6)}...${account.slice(-4)}`;
    document.getElementById("ca").textContent = window.ADDR.CONTRACT;

    provider.on?.("accountsChanged", () => location.reload());
    provider.on?.("chainChanged", () => location.reload());

    alert("✅ กระเป๋าเชื่อมต่อเรียบร้อย");
  } catch (err) {
    console.error(err);
    alert("❌ เชื่อมต่อกระเป๋าไม่สำเร็จ: " + err.message);
  }
}

// === ถอน KJC ===
async function ownerWithdrawKJC() {
  try {
    const to = document.getElementById("withdrawTo").value;
    const amt = document.getElementById("withdrawAmt").value;
    if (!to || !amt) return alert("กรอกข้อมูลให้ครบ");

    await contract.methods.ownerWithdrawKJC(
      web3.utils.toWei(amt, "ether"), to
    ).send({ from: account });

    alert("✅ ถอน KJC สำเร็จ");
  } catch (e) {
    console.error(e);
    alert("❌ ถอน KJC ล้มเหลว: " + e.message);
  }
}

// === ถอน USDT ===
async function ownerWithdrawUSDT() {
  try {
    const to = document.getElementById("withdrawTo").value;
    const amt = document.getElementById("withdrawAmt").value;
    if (!to || !amt) return alert("กรอกข้อมูลให้ครบ");

    await contract.methods.ownerWithdrawUSDT(
      web3.utils.toWei(amt, "ether"), to
    ).send({ from: account });

    alert("✅ ถอน USDT สำเร็จ");
  } catch (e) {
    console.error(e);
    alert("❌ ถอน USDT ล้มเหลว: " + e.message);
  }
}

// === Airdrop Stake ===
async function airdropStake() {
  try {
    const users = document.getElementById("airUsers").value.trim().split(/\n+/);
    const amounts = document.getElementById("airAmounts").value.trim().split(/\n+/);
    const startTime = document.getElementById("airStart").value || Math.floor(Date.now() / 1000);

    if (users.length !== amounts.length)
      return alert("❌ จำนวน address และ amount ไม่ตรงกัน");

    const amountsWei = amounts.map(a => web3.utils.toWei(a, "ether"));
    await contract.methods.airdropStakes(users, amountsWei, startTime)
      .send({ from: account });

    alert("✅ Airdrop Stake สำเร็จ");
  } catch (e) {
    console.error(e);
    alert("❌ ล้มเหลว: " + e.message);
  }
}
