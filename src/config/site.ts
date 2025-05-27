
export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    github: string;
  };
};

export const siteConfig: SiteConfig = {
  name: "CollabCanvas",
  description: "A collaborative rich text editor and whiteboard application.",
  url: "https://example.com", // Replace with your actual URL
  ogImage: "https://example.com/og.jpg", // Replace with your actual OG image URL
  links: {
    github: "https://github.com/your-repo", // Replace with your GitHub repo
  },
};
