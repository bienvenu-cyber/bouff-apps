import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from 'next-themes';

// ✅ Add metadata export for favicon
export const metadata = {
  title: 'BOUFF — Administration',
  description: 'Espace d’administration BOUFF : commandes, carte, équipe et statistiques.',
  icons: {
    icon: '/bouff/favicon.png',
    // You can add more like:
    // shortcut: "/favicon.png",
    // apple: "/apple-touch-icon.png"
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages({ locale });

  return (
    <html lang={locale}>
      <head>
      </head>
      <body>
        <ThemeProvider attribute={'class'} defaultTheme="dark" enableSystem={false}>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
