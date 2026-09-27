import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#2563eb",
        primaryHover: "#1d4ed8",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(37, 99, 235, 0.07)",
        itemSelectedBg: "rgba(37, 99, 235, 0.12)",
        itemSelectedHoverBg: "rgba(37, 99, 235, 0.17)",
        itemText: "#111827",
        tableSelectedBg: "rgba(37, 99, 235, 0.07)",
        tableSelectedHoverBg: "rgba(37, 99, 235, 0.11)",
    },
    dark: {
        primary: "#5b8cff",
        primaryHover: "#7aa2ff",
        primaryText: "#07111f",
        elevatedBg: "#141c27",
        itemHoverBg: "rgba(91, 140, 255, 0.11)",
        itemSelectedBg: "rgba(91, 140, 255, 0.17)",
        itemSelectedHoverBg: "rgba(91, 140, 255, 0.23)",
        itemText: "#edf3fb",
        tableSelectedBg: "rgba(91, 140, 255, 0.10)",
        tableSelectedHoverBg: "rgba(91, 140, 255, 0.16)",
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
                colorBgContainer: dark ? "#101720" : "#ffffff",
                borderRadiusLG: 16,
            },
        },
    };
}
