module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        "spellbound-yellow": "#fdbc08",
        "spellbound-red": "#fc0744",
        "spellbound-blue": "#0ec5ff",
        "spellbound-navy": "#052133",
      },
      fontFamily: {
        custom: ["Jersey 25", "sans-serif"],
      },
    },
  },
  plugins: [],
};