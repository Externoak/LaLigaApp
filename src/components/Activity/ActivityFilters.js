import React from 'react';
import { Filter, Search } from 'lucide-react';

export const ACTIVITY_TYPES = {
  all: 'Todas las actividades',
  1: 'Compras del Mercado',
  4: 'Blindajes',
  6: 'Ganancias por Jornada',
  7: 'Alineaciones Incorrectas',
  9: 'Nuevos Miembros',
  31: 'Fichajes',
  32: 'Cláusulas',
  33: 'Ventas',
  earnings: 'Ganancias por Jornada',
};

export const TIME_FILTERS = {
  all: 'Todo el tiempo',
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
};

export const SORT_OPTIONS = {
  recent: 'Más recientes',
  amount: 'Mayor cantidad',
  user: 'Por usuario',
  activity: 'Por tipo de actividad',
};

const ActivityFilters = ({
  searchTerm,
  onSearchChange,
  activityFilter,
  onActivityFilterChange,
  timeFilter,
  onTimeFilterChange,
  userFilter,
  onUserFilterChange,
  sortBy,
  onSortChange,
  uniqueUsers,
}) => {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
      </div>

      <div className="mb-6">
        <label
          htmlFor="activity-search"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Buscar actividad
        </label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            aria-hidden="true"
          />
          <input
            id="activity-search"
            type="text"
            placeholder="Usuario, jugador o equipo..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label
            htmlFor="activity-type-filter"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Tipo de actividad
          </label>
          <select
            id="activity-type-filter"
            value={activityFilter}
            onChange={(e) => onActivityFilterChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(ACTIVITY_TYPES).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="activity-time-filter"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Período de tiempo
          </label>
          <select
            id="activity-time-filter"
            value={timeFilter}
            onChange={(e) => onTimeFilterChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(TIME_FILTERS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="activity-user-filter"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Usuario específico
          </label>
          <select
            id="activity-user-filter"
            value={userFilter}
            onChange={(e) => onUserFilterChange(e.target.value)}
            className="input-field w-full"
          >
            <option value="all">Todos los usuarios</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="activity-sort-by"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Ordenar por
          </label>
          <select
            id="activity-sort-by"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(SORT_OPTIONS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default ActivityFilters;
