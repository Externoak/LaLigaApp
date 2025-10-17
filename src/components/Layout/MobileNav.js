import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Trophy, ShoppingCart, Users, Edit3, Menu } from 'lucide-react';

const MobileNav = ({ onMenuClick }) => {
  const location = useLocation();

  const mobileMenuItems = [
    { path: '/', icon: Home, label: 'Inicio' },
    { path: '/standings', icon: Trophy, label: 'Tabla' },
    { path: '/my-lineup', icon: Edit3, label: 'Alineación' },
    { path: '/market', icon: ShoppingCart, label: 'Mercado' },
    { path: '/teams', icon: Users, label: 'Equipos' },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-dark-card border-t border-gray-200 dark:border-dark-border mobile-safe-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-primary-500'
                  : 'text-gray-600 dark:text-gray-400 active:text-primary-400'
              }`}
            >
              <item.icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
        {/* Menu button for full navigation */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center flex-1 h-full text-gray-600 dark:text-gray-400 active:text-primary-400 transition-colors"
        >
          <Menu className="w-6 h-6 stroke-2" />
          <span className="text-[10px] mt-1 font-medium">Menú</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileNav;
