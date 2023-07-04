const path = require("path");
const webpack = require("webpack");

module.exports = {
    module: {
        rules: [
            {
                test: /\.wgsl$/i,
                use: "raw-loader"
            },
            {
                test: /\.m?js$/,
                enforce: 'pre',
                use: ['source-map-loader'],
            },
            {
                test: /bvhbuild\.js$/,
                loader: `exports-loader`,
                options: {
                    type: `module`,
                    // this MUST be equivalent to EXPORT_NAME in packages/example-wasm/complile.sh
                    exports: `bvhbuild`,
            },
            },
            // wasm files should not be processed but just be emitted and we want
            // to have their public URL.
            {
                test: /bvhbuild\.wasm$/,
                type: `javascript/auto`,
                loader: `file-loader`,
                // options: {
                // if you add this, wasm request path will be https://domain.com/publicpath/[hash].wasm
                //   publicPath: `static/`,
                // },
            },
            {
                test: /hdrToFloats\.js$/,
                loader: `exports-loader`,
                options: {
                    type: `module`,
                    // this MUST be equivalent to EXPORT_NAME in packages/example-wasm/complile.sh
                    exports: `hdrToFloats`,
            },
            },
            // wasm files should not be processed but just be emitted and we want
            // to have their public URL.
            {
                test: /hdrToFloats\.wasm$/,
                type: `javascript/auto`,
                loader: `file-loader`,
                // options: {
                // if you add this, wasm request path will be https://domain.com/publicpath/[hash].wasm
                //   publicPath: `static/`,
                // },
            },
        ]
    },
    context: path.resolve(__dirname, "."),
    resolve: {
        fallback: {
            crypto: false,
            fs: false,
            path: false
        }
    },
    entry: "./src/js/index.js",
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, "dist"),
    },
    mode: "production"
};