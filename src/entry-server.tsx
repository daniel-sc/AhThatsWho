import { createHandler, StartServer } from '@solidjs/start/server';
export default createHandler(() => (
  <StartServer
    document={(props) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
          <meta name="theme-color" content="#ff624f" />
          <meta
            name="description"
            content="A private, offline home for the names you want to remember."
          />
          <link rel="icon" href="/favicon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v2.png" />
          <link rel="manifest" href="/manifest.webmanifest" />
          {props.assets}
        </head>
        <body>
          <div id="root">{props.children}</div>
          {props.scripts}
        </body>
      </html>
    )}
  />
));
