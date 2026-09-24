import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(23, 23, 23, 0.06)",
        itemSelectedBg: "rgba(23, 23, 23, 0.1)",
        itemSelectedHoverBg: "rgba(23, 23, 23, 0.14)",
        itemText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#a78bfa",
        primaryHover: "#b9a7fb",
        primaryText: "#160e2c",
        elevatedBg: "#15151f",
        itemHoverBg: "rgba(167, 139, 250, 0.10)",
        itemSelectedBg: "rgba(167, 139, 250, 0.16)",
        itemSelectedHoverBg: "rgba(167, 139, 250, 0.22)",
        itemText: "#eaeaf1",
        tableSelectedBg: "rgba(167, 139, 250, 0.10)",
        tableSelectedHoverBg: "rgba(167, 139, 250, 0.16)",
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
            borderRadius: 10,
            motionDurationMid: "0.2s",
            motionDurationSlow: "0.28s",
        },
        components: {
            Button: {
                primaryShadow: "none",
                fontWeight: 500,
                borderRadius: 10,
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
                borderRadius: 10,
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
                borderRadius: 10,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Modal: {
                contentBg: color.elevatedBg,
                headerBg: color.elevatedBg,
                titleColor: color.itemText,
                borderRadiusLG: 18,
            },
            Popover: {
                colorBgElevated: color.elevatedBg,
                borderRadiusLG: 14,
            },
            Card: {
                colorBgContainer: dark ? "#11111a" : "#ffffff",
                borderRadiusLG: 14,
            },
        },
    };
}
