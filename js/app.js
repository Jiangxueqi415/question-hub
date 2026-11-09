// 1. 初始化积分（如果本地没存过，就设为50）
let points = parseInt(localStorage.getItem("points"));
if (isNaN(points)) {
    points = 50;
    localStorage.setItem("points", points);
}

// 2. 页面加载时，把积分显示在顶部
document.addEventListener("DOMContentLoaded", function() {
    let topPointsEl = document.getElementById("top-points");
    if (topPointsEl) {
        topPointsEl.innerText = points;
    }
    
    // 检查是否已经领过该问卷（防重复）
    let claimed = JSON.parse(localStorage.getItem("claimed") || "[]");
    let urlParams = new URLSearchParams(window.location.search);
    let qid = urlParams.get('id'); // 获取链接里的id=1或2

    let claimBtn = document.getElementById("claim-btn");
    if (claimBtn && qid && claimed.includes(qid)) {
        claimBtn.innerText = "已完成填写";
        claimBtn.disabled = true;
        claimBtn.classList.replace("btn-success", "btn-secondary");
    }
});

// 3. 点击领取积分的逻辑
function claimPoints() {
    let urlParams = new URLSearchParams(window.location.search);
    let qid = urlParams.get('id') || '1'; // 默认拿1

    let claimed = JSON.parse(localStorage.getItem("claimed") || "[]");
    
    // 如果没领过
    if (!claimed.includes(qid)) {
        // 加5分并保存
        points += 5;
        localStorage.setItem("points", points);
        
        // 记录该问卷已领
        claimed.push(qid);
        localStorage.setItem("claimed", JSON.stringify(claimed));

        // 更新页面数字
        document.getElementById("top-points").innerText = points;
        
        // 显示提示文字
        document.getElementById("tip").style.display = "block";
        
        // 按钮变灰
        let claimBtn = document.getElementById("claim-btn");
        claimBtn.innerText = "已完成填写";
        claimBtn.disabled = true;
        claimBtn.classList.replace("btn-success", "btn-secondary");
    }
}