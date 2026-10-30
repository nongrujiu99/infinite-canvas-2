import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

/*
 * 界面配色对齐 Photoshop 2020：中性灰阶 + PS 选择蓝，没有任何有色底。
 * 选中态是实心蓝底白字（PS 的列表/菜单选中就是这个样子），
 * 所以 itemSelectedBg 直接用 primary，而不是浅色 tint。
 */
const neutral = {
    light: {
        primary: "#1473e6",
        primaryHover: "#0d66d0",
        primaryText: "#ffffff",
        containerBg: "#f4f4f4",
        layoutBg: "#e9e9e9",
        elevatedBg: "#f7f7f7",
        text: "#1e1e1e",
        textSecondary: "#5c5c5c",
        border: "#b9b9b9",
        borderSecondary: "#cfcfcf",
        itemHoverBg: "rgba(0, 0, 0, 0.06)",
        itemSelectedBg: "#1473e6",
        itemSelectedHoverBg: "#0d66d0",
        itemText: "#1e1e1e",
        selectedText: "#ffffff",
        tableSelectedBg: "rgba(20, 115, 230, 0.10)",
        tableSelectedHoverBg: "rgba(20, 115, 230, 0.16)",
    },
    dark: {
        primary: "#1a6ecc",
        primaryHover: "#2b80e0",
        primaryText: "#ffffff",
        containerBg: "#323232",
        layoutBg: "#1d1d1d",
        elevatedBg: "#3c3c3c",
        text: "#d8d8d8",
        textSecondary: "#a0a0a0",
        border: "#4a4a4a",
        borderSecondary: "#444444",
        itemHoverBg: "rgba(255, 255, 255, 0.08)",
        itemSelectedBg: "#1a6ecc",
        itemSelectedHoverBg: "#2178da",
        itemText: "#d8d8d8",
        selectedText: "#ffffff",
        tableSelectedBg: "rgba(38, 128, 235, 0.22)",
        tableSelectedHoverBg: "rgba(38, 128, 235, 0.30)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            colorBgContainer: color.containerBg,
            colorBgLayout: color.layoutBg,
            colorBgElevated: color.elevatedBg,
            colorBorder: color.border,
            colorBorderSecondary: color.borderSecondary,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.tableSelectedBg,
            controlItemBgActiveHover: color.tableSelectedHoverBg,
            // PS 的控件是近直角：控件 3px、面板 4px，只有徽标用胶囊
            borderRadius: 3,
            borderRadiusLG: 4,
            borderRadiusSM: 3,
            borderRadiusXS: 2,
            motionDurationMid: "0.15s",
            motionDurationSlow: "0.22s",
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
                fontWeight: 500,
                borderRadius: 3,
                borderRadiusLG: 4,
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
                borderRadius: 4,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.selectedText,
                itemColor: color.itemText,
                darkPopupBg: color.elevatedBg,
                darkItemHoverBg: color.itemHoverBg,
                darkItemSelectedBg: color.itemSelectedBg,
                darkItemSelectedColor: color.selectedText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.selectedText,
                borderRadius: 3,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Modal: {
                contentBg: color.elevatedBg,
                headerBg: color.elevatedBg,
                titleColor: color.text,
                borderRadiusLG: 4,
            },
            Popover: {
                colorBgElevated: color.elevatedBg,
                borderRadiusLG: 4,
            },
            Tooltip: {
                colorBgSpotlight: dark ? "#4a4a4a" : "#1e1e1e",
                borderRadius: 3,
            },
            Card: {
                colorBgContainer: color.containerBg,
                borderRadiusLG: 4,
            },
            Segmented: {
                itemSelectedBg: color.elevatedBg,
                itemSelectedColor: color.text,
                borderRadius: 4,
                borderRadiusSM: 2,
            },
        },
    };
}
