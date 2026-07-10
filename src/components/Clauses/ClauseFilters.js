import React from 'react';
import {
  Shield, User, Trophy, Filter, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getPositionName } from '../../utils/helpers';

const POSITION_TEXT = {
  all: 'text-gray-700 dark:text-gray-300',
  1: 'text-yellow-700 dark:text-yellow-300',
  2: 'text-blue-700 dark:text-blue-300',
  3: 'text-green-700 dark:text-green-300',
  4: 'text-red-700 dark:text-red-300',
};

const POSITION_BORDER = {
  all: 'border-gray-200 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700',
  1: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800',
  2: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800',
  3: 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800',
  4: 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800',
};

const POSITION_ICON_COLOR = {
  all: 'text-gray-600 dark:text-gray-400',
  1: 'text-yellow-600 dark:text-yellow-400',
  2: 'text-blue-600 dark:text-blue-400',
  3: 'text-green-600 dark:text-green-400',
  4: 'text-red-600 dark:text-red-400',
};

const POSITION_SUBTEXT = {
  all: 'text-gray-600 dark:text-gray-400',
  1: 'text-yellow-600 dark:text-yellow-400',
  2: 'text-blue-600 dark:text-blue-400',
  3: 'text-green-600 dark:text-green-400',
  4: 'text-red-600 dark:text-red-400',
};

const SORT_LABEL = {
  clauseValue: 'Valor de Cláusula',
  marketValue: 'Valor de Mercado',
  points: 'Puntos',
  timeRemaining: 'Tiempo Restante',
};

const ClauseFilters = ({
  showAll,
  setShowAll,
  ownerFilter,
  setOwnerFilter,
  positionFilter,
  setPositionFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  filteredClauses,
  clausesData,
  uniqueOwners,
}) => {
  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Filtros y Ordenación
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Show All Toggle */}
        <div className="flex flex-col h-full" style={{ minHeight: '160px' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Filtro de disponibilidad
          </label>
          <div className="space-y-2">
            <div
              className={`px-3 py-2 rounded-lg border-2 ${
                showAll
                  ? 'border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800'
                  : 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {showAll ? (
                  <Eye className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                ) : (
                  <Shield className="w-4 h-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                )}
                <span
                  className={`text-sm font-medium ${
                    showAll
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-green-700 dark:text-green-300'
                  }`}
                >
                  {showAll ? 'Todas las cláusulas' : 'Solo disponibles'}
                </span>
              </div>
              <div
                className={`text-xs mt-1 ${
                  showAll
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-green-600 dark:text-green-400'
                }`}
              >
                {showAll
                  ? `${filteredClauses.length} cláusulas en total`
                  : `${
                      filteredClauses.filter(
                        (c) =>
                          !c.isLocked ||
                          (c.unlockTime && new Date(c.unlockTime) <= new Date())
                      ).length
                    } cláusulas disponibles`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              aria-pressed={showAll}
              className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 border-2 text-sm ${
                showAll
                  ? 'border-green-300 bg-green-100 hover:bg-green-200 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-200'
                  : 'border-primary-300 bg-primary-100 hover:bg-primary-200 text-primary-800 dark:border-primary-600 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 dark:text-primary-200'
              }`}
            >
              {showAll ? (
                <>
                  <Shield className="w-3 h-3" aria-hidden="true" />
                  <span>Solo disponibles</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" aria-hidden="true" />
                  <span>Todas</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Owner Filter */}
        <div className="flex flex-col h-full">
          <label
            htmlFor="owner-filter"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Filtro por manager
          </label>
          <div className="space-y-2">
            <div
              className={`px-3 py-2 rounded-lg border-2 ${
                ownerFilter === 'all'
                  ? 'border-gray-200 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700'
                  : 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <User
                  className={`w-4 h-4 ${
                    ownerFilter === 'all'
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`text-sm font-medium ${
                    ownerFilter === 'all'
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {ownerFilter === 'all' ? 'Todos los managers' : ownerFilter}
                </span>
              </div>
              <div
                className={`text-xs mt-1 ${
                  ownerFilter === 'all'
                    ? 'text-gray-600 dark:text-gray-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              >
                {ownerFilter === 'all'
                  ? `${uniqueOwners.length} managers diferentes`
                  : `${filteredClauses.length} cláusulas de este manager`}
              </div>
            </div>

            <select
              id="owner-filter"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="input-field w-full"
            >
              <option value="all">🌐 Todos los managers</option>
              {uniqueOwners.map((owner) => (
                <option key={owner} value={owner}>
                  👤 {owner}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Position Filter */}
        <div className="flex flex-col h-full">
          <label
            htmlFor="position-filter"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Filtro por posición
          </label>
          <div className="space-y-2">
            <div className={`px-3 py-2 rounded-lg border-2 ${POSITION_BORDER[positionFilter] || POSITION_BORDER.all}`}>
              <div className="flex items-center gap-2">
                <Trophy
                  className={`w-4 h-4 ${POSITION_ICON_COLOR[positionFilter] || POSITION_ICON_COLOR.all}`}
                  aria-hidden="true"
                />
                <span
                  className={`text-sm font-medium ${POSITION_TEXT[positionFilter] || POSITION_TEXT.all}`}
                >
                  {positionFilter === 'all'
                    ? 'Todas las posiciones'
                    : getPositionName(parseInt(positionFilter))}
                </span>
              </div>
              <div className={`text-xs mt-1 ${POSITION_SUBTEXT[positionFilter] || POSITION_SUBTEXT.all}`}>
                {positionFilter === 'all'
                  ? `${clausesData.length} cláusulas en total`
                  : `${
                      clausesData.filter(
                        (c) => c.positionId.toString() === positionFilter
                      ).length
                    } cláusulas de esta posición`}
              </div>
            </div>

            <select
              id="position-filter"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="input-field w-full"
            >
              <option value="all">🌐 Todas las posiciones</option>
              <option value="1">🥅 Porteros</option>
              <option value="2">🛡️ Defensas</option>
              <option value="3">⚽ Centrocampistas</option>
              <option value="4">🎯 Delanteros</option>
            </select>
          </div>
        </div>

        {/* Sort By */}
        <div className="flex flex-col h-full">
          <label
            htmlFor="sort-by"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Ordenar por
          </label>
          <div className="space-y-2">
            <div className="px-3 py-2 rounded-lg border-2 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800">
              <div className="flex items-center gap-2">
                <Trophy
                  className="w-4 h-4 text-purple-600 dark:text-purple-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  {SORT_LABEL[sortBy] || SORT_LABEL.clauseValue}
                </span>
              </div>
              <div className="text-xs mt-1 text-purple-600 dark:text-purple-400">
                {sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
              </div>
            </div>

            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field w-full"
            >
              <option value="clauseValue">💰 Valor de Cláusula</option>
              <option value="marketValue">📈 Valor de Mercado</option>
              <option value="points">🏆 Puntos</option>
              <option value="timeRemaining">⏰ Tiempo Restante</option>
            </select>
          </div>
        </div>

        {/* Sort Order */}
        <div className="flex flex-col h-full" style={{ minHeight: '160px' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Orden
          </label>
          <div className="space-y-2">
            <div
              className={`px-3 py-2 rounded-lg border-2 ${
                sortOrder === 'desc'
                  ? 'border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800'
                  : 'border-teal-200 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {sortOrder === 'desc' ? (
                  <ChevronDown
                    className="w-4 h-4 text-orange-600 dark:text-orange-400"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronUp
                    className="w-4 h-4 text-teal-600 dark:text-teal-400"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`text-sm font-medium ${
                    sortOrder === 'desc'
                      ? 'text-orange-700 dark:text-orange-300'
                      : 'text-teal-700 dark:text-teal-300'
                  }`}
                >
                  {sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
                </span>
              </div>
              <div
                className={`text-xs mt-1 ${
                  sortOrder === 'desc'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-teal-600 dark:text-teal-400'
                }`}
              >
                {sortOrder === 'desc'
                  ? 'Primero los valores más altos'
                  : 'Primero los valores más bajos'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              aria-label={`Cambiar orden a ${
                sortOrder === 'desc' ? 'menor a mayor' : 'mayor a menor'
              }`}
              className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 border-2 text-sm ${
                sortOrder === 'desc'
                  ? 'border-teal-300 bg-teal-100 hover:bg-teal-200 text-teal-800 dark:border-teal-600 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 dark:text-teal-200'
                  : 'border-orange-300 bg-orange-100 hover:bg-orange-200 text-orange-800 dark:border-orange-600 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-200'
              }`}
            >
              {sortOrder === 'desc' ? (
                <>
                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  <span>Menor a mayor</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  <span>Mayor a menor</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClauseFilters;
