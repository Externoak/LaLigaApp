import React from 'react';
import { Filter, Search } from 'lucide-react';

const POSITIONS = {
  all: 'Todas las posiciones',
  1: 'Portero',
  2: 'Defensa',
  3: 'Centrocampista',
  4: 'Delantero',
};

const PRICE_RANGES = {
  all: 'Todos los precios',
  low: '< 10M',
  medium: '10M - 50M',
  high: '> 50M',
};

const OWNER_TYPES = {
  all: 'Todos los estados',
  free: 'Jugadores Libres',
  owned: 'Con Propietario',
};

/**
 * FilterBar — search + position + price + owner + sort controls
 * for the Market list. Pure controlled component.
 */
const FilterBar = ({
  searchTerm,
  onSearchTermChange,
  positionFilter,
  onPositionFilterChange,
  priceFilter,
  onPriceFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  sortBy,
  onSortByChange,
}) => {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <label htmlFor="market-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Buscar jugador
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="market-search"
            type="text"
            placeholder="Nombre del jugador..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="market-position" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Posición
          </label>
          <select
            id="market-position"
            value={positionFilter}
            onChange={(e) => onPositionFilterChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(POSITIONS).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="market-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Rango de precio
          </label>
          <select
            id="market-price"
            value={priceFilter}
            onChange={(e) => onPriceFilterChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(PRICE_RANGES).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="market-owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Estado
          </label>
          <select
            id="market-owner"
            value={ownerFilter}
            onChange={(e) => onOwnerFilterChange(e.target.value)}
            className="input-field w-full"
          >
            {Object.entries(OWNER_TYPES).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="market-sort" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Ordenar por
          </label>
          <select
            id="market-sort"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
            className="input-field w-full"
          >
            <option value="price">Precio</option>
            <option value="value">Valor</option>
            <option value="points">Puntos</option>
            <option value="expiration">Expiración</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export { POSITIONS, PRICE_RANGES, OWNER_TYPES };
export default FilterBar;
