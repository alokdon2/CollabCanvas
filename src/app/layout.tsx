
import type { Metadata } from 'next';
import { Reddit_Sans } from 'next/font/google'; // Changed font import
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from '@/config/site';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { AuthProvider } from '@/contexts/AuthContext';

// Instantiate Reddit Sans
const redditSans = Reddit_Sans({
  variable: '--font-reddit-sans',
  subsets: ['latin'],
  display: 'swap', // Recommended for performance
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Updated body className to use Reddit Sans variable and ensure font-sans is applied */}
      <body className={`${redditSans.variable} font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <ProjectProvider>
            <ThemeProvider
              defaultTheme="system"
              storageKey="collabcanvas-theme"
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </ProjectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
