<!--
SPDX-FileCopyrightText: 2026 The HedgeDoc developers (see AUTHORS file)

SPDX-License-Identifier: AGPL-3.0-only
-->

# Note Graph View

筆記關係圖視圖。以目前開啟的筆記為中心，將與其相連的筆記以卡片形式繪製成圖，
並用連線表示筆記之間的連結方向。

連結有兩種型別：

- `uni`（單向）：`A → B`，代表 A 指向 B。
- `bid`（雙向）：`A ↔ B`，代表兩個方向皆相連。

視圖提供兩種展開模式：**Direct** 與 **Indirect**。

## Direct Mode（直接連結）

只顯示與目前筆記**直接相連**的筆記（一層 / 一個 hop）。

資料來源：

- `getNoteLinks`：目前筆記的 outgoing 連結（自己 → 別人）。
- `getCrossNoteBacklinks`：目前筆記的 incoming 連結（別人 → 自己）。

不論連結方向（uni 或 bid），只要與目前筆記直接相連就會顯示。

範例（目前筆記為 `C`）：

```
A → B → C → D → E
C ↔ F
```

`C` 的直接相連為：`B → C`（incoming）、`C → D`（outgoing）、`C ↔ F`（bid）。
因此 Direct 模式顯示 `B`、`D`、`F`（加上 `C` 本身），不會出現 `A`、`E`。

## Indirect Mode（間接連結，沿方向前向展開）

從目前筆記出發，沿著連結的**方向**做前向展開（directed forward traversal），
而非展開整個無向連通分量。展開規則如下：

從任一已抵達的節點，會繼續往以下節點擴展：

1. 其 **outgoing 連結**的 target（uni 或 bid 皆跟隨）。
2. 其 **incoming 的雙向（bid）連結**的對端（bid 仍可往回走）。

而 **incoming 的單向（uni）連結**（別人 → 此節點）是指向節點「內部」的，
因此**不顯示也不展開**。

這讓圖形維持為：「目前筆記指向的筆記，以及那些筆記再指向的筆記，依此類推」。

範例（目前筆記為 `C`）：

```
A → B → C → D → E
C ↔ F
```

逐步展開：

- 從 `C` 出發。
- `B → C` 是 `C` 的 incoming **uni** 連結 → 忽略，因此不會帶出 `B`、`A`。
- `C → D` 是 outgoing 連結 → 展開到 `D`，再從 `D → E` 展開到 `E`。
- `C ↔ F` 是 bid 連結 → 展開到 `F`。

最終結果：

```
F ↔ C → D → E
```

只保留 `C`、`D`、`E`、`F`。

## 模式對照

| 項目                     | Direct          | Indirect                          |
| ------------------------ | --------------- | --------------------------------- |
| 展開深度                 | 1 層            | 沿方向遞迴展開                    |
| outgoing 連結（uni/bid） | 顯示直接相連    | 跟隨並繼續展開                    |
| incoming **bid** 連結    | 顯示直接相連    | 跟隨並繼續展開                    |
| incoming **uni** 連結    | 顯示直接相連    | 不顯示、不展開                    |
