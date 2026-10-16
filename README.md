# 菜鸟批量出库助手 | Cainiao Batch Outbound Assistant

**版本 / Version: 1.0.0**

[简体中文](#简体中文) | [English](#english)

## 简体中文

### 应用场景

面向使用 AliExpress 跨境卖家中心（CSP）和菜鸟海外仓的卖家。插件将待发货订单与本机 PDF 面单对应，读取订单资料，并辅助预填菜鸟出库委托单，减少重复复制和手工录入。它是独立的浏览器助手，不是 AliExpress 或菜鸟官方产品。

### 功能与流程

- 选择本机面单目录，按 PDF 修改日期分组，并按日期或逐单选择订单；PDF 文件名（不含扩展名）作为订单号。
- 在已登录的 CSP 发货页面按订单号读取商品编码和数量、买家信息、首公里服务商及运单号。
- 将订单资料保存在扩展专用 IndexedDB 中；关闭侧栏后可恢复。
- 解析常见欧洲收件地址；有歧义时提示人工核对。
- 辅助填写菜鸟出库单：波兰仓、订单号、仓库 SKU、DPD/InPost 服务、运单号和对应 PDF 面单。
- 地址统计仅输出结构和计数，不包含订单号或原始地址。

### 使用步骤

1. 在 Chrome 登录 CSP，打开“物流 → 我要发货 → 运输中 → 待揽收”。
2. 打开菜鸟“新建出库委托单”页面。
3. 打开扩展侧栏，选择含 PDF 面单的本机目录并授权读取。
4. 选择订单并批量读取资料，检查 SKU、数量、物流资料和地址解析结果。
5. 预填菜鸟表单后，逐项核对仓库、订单号、收件人、SKU、物流服务、运单号和 PDF。
6. 核对无误后，由用户在菜鸟页面手动创建出库单。

### 安装

1. 下载并解压本仓库。
2. 在 Chrome 打开 chrome://extensions 并开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择包含 manifest.json 的插件文件夹。
4. 打开扩展侧栏，选择本机 PDF 面单目录。

当前通过“加载已解压的扩展程序”安装；更新时下载新版本，并在扩展管理页点击“重新加载”。

### 隐私与安全

订单资料可能含姓名、电话和地址，保存在当前 Chrome 配置文件的扩展 IndexedDB，不会发送到本项目服务器；本项目没有后端。插件不会自动点击菜鸟的创建或提交按钮，用户需核对后手动提交。清除扩展数据、移除扩展或更换 Chrome 配置文件可能导致本地记录丢失。

### 兼容性

插件依赖 CSP 和菜鸟页面当前的界面结构，平台更新可能影响读取或预填。地址解析采用启发式规则；有歧义时需人工检查。出现失败提示时请勿提交该订单。

## English

### Use case

This extension assists sellers who use the AliExpress Cross-border Seller Center (CSP) and Cainiao overseas warehouses. It matches pending orders with local PDF shipping labels, reads order data, and helps prefill Cainiao outbound forms. It is an independent browser assistant, not an official AliExpress or Cainiao product.

### Features and workflow

- Select a local label folder, group PDF files by modification date, and select orders by day or individually. Each PDF filename (without its extension) is treated as the order number.
- Read SKU codes and quantities, buyer details, first-mile carrier, and tracking number from the signed-in CSP shipping page.
- Store collected order data in the extension's IndexedDB so it can be restored after closing the side panel.
- Parse common European addresses and request manual review when a format is ambiguous.
- Assist with prefilling the Cainiao form: Poland warehouse, order IDs, warehouse SKU, DPD/InPost service, tracking number, and the matching PDF label.
- Address statistics contain structural counts only, not order IDs or raw addresses.

### Steps

1. Sign in to CSP in Chrome and open Logistics → Ship Orders → In Transit → To Be Collected.
2. Open the Cainiao Create Outbound Order page.
3. Open the extension side panel, select the local PDF label folder, and grant read access.
4. Select orders, read their details, and review the SKU, quantity, shipping data, and parsed address.
5. Prefill the Cainiao form and verify the warehouse, order IDs, recipient, SKU, shipping service, tracking number, and PDF label.
6. After checking the form, manually create the outbound order in Cainiao.

### Installation

1. Download and extract this repository.
2. Open chrome://extensions in Chrome and enable Developer mode.
3. Choose Load unpacked and select the extension folder containing manifest.json.
4. Open the extension side panel and select the local PDF label folder.

This project currently supports unpacked installation. To update, download the new version and click Reload on the Chrome extensions page.

### Privacy and safety

Order records may contain buyer names, phone numbers, and addresses. They are stored in the extension's IndexedDB in the current Chrome profile and are not sent to a project server; this project has no backend. The extension does not automatically click Cainiao's create or submit button. The user reviews and submits each order manually. Clearing extension data, removing the extension, or changing Chrome profiles may remove or hide local records.

### Compatibility

The extension relies on the current CSP and Cainiao page structures; platform changes may require updates. Address parsing is heuristic and ambiguous formats need manual review. Do not submit an order after a failure is reported.
