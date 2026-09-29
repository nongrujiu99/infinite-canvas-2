import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#4f46e5",
        primaryHover: "#4338ca",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(79, 70, 229, 0.07)",
        itemSelectedBg: "rgba(79, 70, 229, 0.13)",
        itemSelectedHoverBg: "rgba(79, 70, 229, 0.18)",
        itemText: "#17162b",
        tableSelectedBg: "rgba(79, 70, 229, 0.07)",
        tableSelectedHoverBg: "rgba(79, 70, 229, 0.12)",
    },
    dark: {
        primary: "#818cf8",
        primaryHover: "#a5b4fc",
        primaryText: "#080b16",
        elevatedBg: "#151a2f",
        itemHoverBg: "rgba(129, 140, 248, 0.11)",
        itemSelectedBg: "rgba(79, 70, 229, 0.25)",
        itemSelectedHoverBg: "rgba(79, 70, 229, 0.32)",
        itemText: "#f2f4ff",
        tableSelectedBg: "rgba(79, 70, 229, 0.16)",
        tableSelectedHoverBg: "rgba(79, 70, 229, 0.22)",
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
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
            borderRadius: 12,
            motionDurationMid: "0.2s",
            motionDurationSlow: "0.28s",
        },
        components: {
            Button: {
                primaryShadow: "none",
                fontWeight: 500,
                borderRadius: 12,
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
                borderRadius: 12,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: neutral.dark.itemSelectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
                borderRadius: 12,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Modal: {
                contentBg: color.elevatedBg,
                headerBg: color.elevatedBg,
                titleColor: color.itemText,
                borderRadiusLG: 16,
            },
            Popover: {
                colorBgElevated: color.elevatedBg,
                borderRadiusLG: 16,
            },
            Card: {
                colorBgContainer: dark ? "#111528" : "#ffffff",
                borderRadiusLG: 16,
            },
        },
    };
}
