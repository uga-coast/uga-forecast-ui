export const LAYER_CONFIGS = {
  maxele: {
    key: "maxele",
    label: "Maximum Water Level (ft NAVD88)",
    legendTitle: "Max Water Level (ft NAVD88)",
    unitLabel: "ft NAVD88",
    emptyText: "Dry",
    emptyAtOrBelow: 0,
    transparentAtOrBelow: 0,
    maxClamp: 9,
    maxColor: "#8c2d04",
    colorStops: [
      [0.0, [34, 94, 168]],
      [0.5, [65, 140, 190]],
      [1.0, [90, 170, 200]],
      [1.5, [120, 195, 205]],
      [2.0, [150, 215, 210]],
      [2.5, [185, 230, 205]],
      [3.0, [220, 238, 190]],
      [3.5, [240, 236, 170]],
      [4.0, [247, 225, 140]],
      [4.5, [250, 205, 110]],
      [5.0, [245, 180, 90]],
      [5.5, [235, 150, 75]],
      [6.0, [220, 120, 65]],
      [6.5, [205, 95, 55]],
      [7.0, [188, 72, 48]],
      [7.5, [170, 55, 40]],
      [8.0, [150, 42, 30]],
      [8.5, [125, 35, 20]],
      [9.0, [140, 45, 4]]
    ],
    legendGradient:
      "linear-gradient(to right, #225ea8, #418cbe, #5aaac8, #78c3cd, #96d7d2, #b9e6cd, #dceeBE, #f0ecaa, #f7e18c, #facd6e, #f5b45a, #eb964b, #dc7841, #cd5f37, #bc4830, #aa3728, #962a1e, #7d2314, #8c2d04)",
    legendTicks: ["0", "3", "6", "9+"]
  },

  swan_HS_max: {
    key: "swan_HS_max",
    label: "Maximum Significant Wave Height (ft)",
    legendTitle: "Max Significant Wave Height (ft)",
    unitLabel: "ft",
    emptyText: "No waves",
    emptyAtOrBelow: 0.05,
    transparentAtOrBelow: 0.05,
    maxClamp: 20,
    maxColor: "#7a0177",
    colorStops: [
      [0.0, [247, 252, 240]],
      [0.5, [224, 243, 219]],
      [1.0, [204, 235, 197]],
      [2.0, [168, 221, 181]],
      [3.0, [123, 204, 196]],
      [4.0, [78, 179, 211]],
      [5.0, [43, 140, 190]],
      [6.0, [8, 104, 172]],
      [8.0, [8, 64, 129]],
      [10.0, [84, 39, 143]],
      [15.0, [122, 1, 119]],
      [20.0, [122, 1, 119]]
    ],
    legendGradient:
      "linear-gradient(to right, #f7fcf0, #e0f3db, #ccebc5, #a8ddb5, #7bccc4, #4eb3d3, #2b8cbe, #0868ac, #084081, #54278f, #7a0177)",
    legendTicks: ["0", "5", "10", "20+"]
  }
};

export const RASTER_LAYER_ORDER = ["maxele", "swan_HS_max"];