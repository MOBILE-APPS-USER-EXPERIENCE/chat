module.exports = function (api) {
    api.cache(true);

    return {
        presets: ['babel-preset-expo'],
        // Drizzle's Expo migrator imports the generated `.sql` files; this inlines them as strings.
        plugins: [['inline-import', { extensions: ['.sql'] }]],
    };
};
