# 菜鸟批量出库助手 | Cainiao Batch Outbound Assistant


**版本 / Version: 1.0.5** · [下载 v1.0.5 插件 ZIP / Download extension ZIP](https://github.com/Bailong-Huang/cainiao-outbound-batch/releases/download/v1.0.5/cainiao-outbound-batch-v1.0.5.zip)


[简体中文](#简体中文) | [English](#english)

## 简体中文

### 应用场景

面向使用 AliExpress 跨境卖家中心（CSP）和菜鸟海外仓的卖家。插件将待发货订单与本机 PDF 面单对应，读取订单资料，并辅助预填菜鸟出库委托单。它是独立的浏览器助手，不是 AliExpress 或菜鸟官方产品。

### 功能
- 选择本机面单目录，按日期分组并逐单/按日选择；PDF 文件名（不含扩展名）作为订单号。
- 从已登录的 CSP 页面读取 SKU、数量、买家信息、首公里服务商和运单号。
- 订单资料保存在扩展专用 IndexedDB，关闭侧栏后可以恢复。
- 解析常见欧洲地址（包括波兰 Paczkomat 快递柜地址），不确定时提示人工核对。
- 辅助填写菜鸟出库单：波兰仓、订单号、仓库 SKU、DPD/InPost 服务、运单号和对应 PDF 面单。
- 不自动提交出库单；请核对所有字段后手动创建。

### 安装和使用
1. 从上方 Release 下载 ZIP 并解压。
2. 在 Chrome 打开 chrome://extensions，开启“开发者模式”，点击“加载已解压的扩展程序”，选择含 manifest.json 的文件夹。
3. 登录 CSP 并打开“物流 → 我要发货 → 运输中 → 待揽收”，同时打开菜鸟新建出库委托单页面。
4. 在扩展侧栏选择面单目录、选择订单、批量读取资料并预填；检查表单后手动提交。

### 隐私与兼容性
订单资料可能包含买家姓名、电话和地址，仅保存在当前 Chrome 配置文件的扩展 IndexedDB，不会发送到本项目服务器。本项目不含后端。地址解析采用启发式规则，平台页面更新也可能影响自动化；遇到失败提示时请勿提交该订单。清除扩展数据、移除扩展或更换 Chrome 配置文件可能导致本地记录丢失。



## English

### Use case
An independent browser assistant for sellers using the AliExpress Cross-border Seller Center (CSP) and Cainiao overseas warehouses. It matches pending orders with local PDF labels, reads order details, and helps prefill Cainiao outbound forms. It is not an official AliExpress or Cainiao product.

### Features
- Select a local label folder, group PDFs by date, and select orders individually or by day. Each PDF filename (without extension) is treated as the order ID.
- Read SKU codes and quantities, buyer details, first-mile carrier, and tracking number from the signed-in CSP page.
- Store order records in the extension's IndexedDB so they persist after the side panel closes.
- Parse common European addresses, including Polish Paczkomat parcel-locker addresses, and request manual review when uncertain.
- Help fill Cainiao outbound forms with the Poland warehouse, order IDs, warehouse SKUs, DPD/InPost service, tracking number, and matching PDF label.
- The extension never submits an outbound order automatically. Review the fields and submit manually.

### Install and use
1. Download and extract the ZIP from the Release link above.
2. Open chrome://extensions, enable Developer mode, choose Load unpacked, and select the folder containing manifest.json.
3. Sign in to CSP and open Logistics → Ship Orders → In Transit → To Be Collected. Also open Cainiao's Create Outbound Order page.
4. In the side panel, select the label folder and orders, read the data, then prefill. Review and manually submit the form.

### Privacy and compatibility
Order records may contain buyer names, phone numbers, and addresses. They are stored only in the extension's IndexedDB in the current Chrome profile and are not sent to a project server; this project has no backend. Address parsing is heuristic and platform updates may affect automation. Do not submit an order after an error is reported. Clearing extension data, removing the extension, or changing Chrome profiles may cause local records to be lost.


