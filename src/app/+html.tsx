import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  return <html lang="de">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Chat · Deine Gespräche</title>
      <ScrollViewStyleReset />
    </head>
    <body>{children}</body>
  </html>;
}
