import { Feather } from 'lucide-react';
import Link from 'next/link';
import type { FC } from 'react';

interface AppLogoProps {
  className?: string;
}

const AppLogo: FC<AppLogoProps> = ({ className }) => {
  return (
    <Link href="/" className={`flex items-center space-x-2 text-primary ${className}`}>
      <Feather className="h-6 w-6" />
      <span className="font-bold text-xl">CollabCanvas</span>
    </Link>
  );
};

export default AppLogo;
