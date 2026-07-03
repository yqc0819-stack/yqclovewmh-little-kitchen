$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$html = Get-Content -Raw -Encoding UTF8 (Join-Path $root "index.html")
$app = Get-Content -Raw -Encoding UTF8 (Join-Path $root "app.js")
$cloud = Get-Content -Raw -Encoding UTF8 (Join-Path $root "cloud-adapter.js")
$helpers = Get-Content -Raw -Encoding UTF8 (Join-Path $root "state-helpers.js")
$css = Get-Content -Raw -Encoding UTF8 (Join-Path $root "styles.css")
$script:passed = 0

function Assert-Contains {
    param(
        [string]$Group,
        [string]$Name,
        [string]$Source,
        [string]$Expected
    )
    if (-not $Source.Contains($Expected)) {
        throw "[$Group] 未通过：$Name"
    }
    $script:passed++
    Write-Output "PASS [$Group] $Name"
}

Assert-Contains "菜品库" "新增菜品入口" $html 'id="open-add-dish"'
Assert-Contains "菜品库" "独立管理窗口" $html 'id="library-dialog"'
Assert-Contains "菜品库" "修改按钮绑定" $app 'data-edit-id'
Assert-Contains "菜品库" "删除按钮绑定" $app 'data-delete-id'
Assert-Contains "菜品库" "编辑状态更新" $helpers 'updateDishInState'
Assert-Contains "菜品库" "删除关联清理" $helpers 'removeDishFromState'

Assert-Contains "图片" "图片文件选择" $html 'accept="image/jpeg,image/png,image/webp"'
Assert-Contains "图片" "上传前压缩" $app 'function compressImage'
Assert-Contains "图片" "替换图片预览" $app '菜品照片预览'
Assert-Contains "图片" "移除照片按钮" $html 'id="remove-dish-image"'
Assert-Contains "图片" "云端图片地址渲染" $app '|| /^https:\/\/'
Assert-Contains "图片" "旧照片云端清理" $cloud 'deleteStoredDishImage'
Assert-Contains "图片" "删除菜品时清理照片" $cloud 'await deleteStoredDishImage(previousImageUrl)'

Assert-Contains "发布" "今日菜单选择区" $html 'id="admin-dish-grid"'
Assert-Contains "发布" "发布按钮" $html 'id="publish-menu"'
Assert-Contains "发布" "发布逻辑" $app 'function publishMenu'

Assert-Contains "点餐" "菜品选择逻辑" $app 'function toggleDinerDish'
Assert-Contains "点餐" "口味备注" $html 'id="taste-note"'
Assert-Contains "点餐" "快捷备注" $html 'class="quick-notes"'
Assert-Contains "点餐" "提交选择" $app 'function submitChoice'

Assert-Contains "提醒进度" "页面红点" $html 'class="notification-dot hidden"'
Assert-Contains "提醒进度" "选择结果面板" $html 'id="latest-result"'
Assert-Contains "提醒进度" "已看到状态" $html 'data-status="seen"'
Assert-Contains "提醒进度" "准备中状态" $html 'data-status="preparing"'
Assert-Contains "提醒进度" "已完成状态" $html 'data-status="done"'
Assert-Contains "提醒进度" "状态更新逻辑" $app 'function setStatus'

Assert-Contains "历史" "点餐端历史" $html 'id="diner-history"'
Assert-Contains "历史" "管理端历史" $html 'id="admin-history"'
Assert-Contains "历史" "历史渲染逻辑" $app 'function renderHistory'

Assert-Contains "持久化" "本地读取" $app 'localStorage.getItem'
Assert-Contains "持久化" "本地保存" $app 'localStorage.setItem'
Assert-Contains "云端" "Supabase 登录" $app 'KitchenCloud.login'
Assert-Contains "云端" "云端数据加载" $app 'KitchenCloud.fetchState'
Assert-Contains "云端" "点餐结果独立查询" $cloud '.from("selections")'
Assert-Contains "云端" "云端菜单发布" $app 'KitchenCloud.publishMenu'
Assert-Contains "云端" "云端点餐提交" $app 'KitchenCloud.submitChoice'
Assert-Contains "云端" "重复点餐自动覆盖" $cloud '.upsert({'
Assert-Contains "云端" "实时刷新入口" $app 'reloadCloudState(true)'
Assert-Contains "云端" "实时掉线补同步" $app 'function startCloudPolling'
Assert-Contains "云端" "回到页面立即同步" $app 'visibilitychange'
Assert-Contains "云端" "登录界面" $html 'id="auth-screen"'
Assert-Contains "云端" "六位密码登录" $html 'minlength="6"'
Assert-Contains "入口" "点餐端切换" $html 'data-view="diner"'
Assert-Contains "入口" "管理端切换" $html 'data-view="admin"'

$ids = [regex]::Matches($html, 'id="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$duplicates = @($ids | Group-Object | Where-Object Count -gt 1)
if ($duplicates.Count -gt 0) {
    throw "HTML 存在重复 id：$($duplicates.Name -join ', ')"
}
$script:passed++
Write-Output "PASS [结构] HTML 无重复 id"

$openBraces = ([regex]::Matches($css, '\{')).Count
$closeBraces = ([regex]::Matches($css, '\}')).Count
if ($openBraces -ne $closeBraces) {
    throw "CSS 大括号数量不匹配：$openBraces / $closeBraces"
}
$script:passed++
Write-Output "PASS [结构] CSS 大括号完整"

foreach ($script in @("supabase-config.js", "state-helpers.js", "cloud-adapter.js", "app.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $script))) {
        throw "缺少脚本：$script"
    }
}
$script:passed++
Write-Output "PASS [资源] 页面脚本齐全"
Write-Output "TOTAL PASS: $script:passed"
