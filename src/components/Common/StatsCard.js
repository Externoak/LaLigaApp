import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const StatsCard = ({ title, value, subtitle, icon: Icon, color, trend }) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true" />;
      case 'down':
        return <ArrowDown className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />;
    }
  };

  return (
    <div className="card p-4 xl:p-5 hover-scale overflow-hidden">
      {/* Mobile Layout - Below xl breakpoint (1280px) */}
      <div className="xl:hidden">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {title}
          </p>
          <div className={`p-1.5 rounded-lg bg-gradient-to-br flex-shrink-0 ${color}`}>
            <Icon className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate" title={String(value)}>
            {value}
          </h3>
          {getTrendIcon()}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
          {subtitle}
        </p>
      </div>

      {/* Desktop Layout - xl breakpoint and above (1280px+) */}
      <div className="hidden xl:flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mt-2 min-w-0">
            <h3 className="text-xl 2xl:text-2xl font-bold text-gray-900 dark:text-white truncate" title={String(value)}>
              {value}
            </h3>
            {getTrendIcon()}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {subtitle}
          </p>
        </div>
        <div className={`p-2 rounded-lg bg-gradient-to-br flex-shrink-0 ${color}`}>
          <Icon className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
