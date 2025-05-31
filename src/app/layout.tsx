
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from '@/config/site';
import { ProjectProvider } from '@/contexts/ProjectContext'; // Added

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico", // Placeholder, not generating actual favicon
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ProjectProvider> {/* Added ProjectProvider Wrapper */}
          <ThemeProvider
            defaultTheme="system"
            storageKey="collabcanvas-theme"
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
