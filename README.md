# Mud Goods Payment Landing Page

A small static landing page for QR-code payments. It uses plain HTML and CSS. There are no third-party scripts, no customer data collection, and no framework dependency.

## Payment links

The live payment links are in `index.html`:

- `https://venmo.com/u/mudgoods`
- `https://cash.app/$MudGoods`
- `https://paypal.me/mudgoods`

If the payment providers change, update the button `href` values in `index.html`.

## Deploy on Vercel

This can be deployed as a static site. Vercel should serve `index.html` from the project root without any build command.

`.vercelignore` excludes local-only files such as the QR generator script and draft QR output from the deployed site.
`qr-code.svg` is also ignored by git because it should be regenerated from the final Vercel URL.

## Generate the QR code

After Vercel gives you the final deployment URL, run:

```sh
node scripts/generate-qr.mjs "https://your-vercel-url.vercel.app"
```

The QR code will be written to `qr-code.svg`.
