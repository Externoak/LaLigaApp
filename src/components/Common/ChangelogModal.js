import React, { useState, useEffect } from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from '../../utils/motionShim';

const ChangelogModal = ({ isOpen, onClose }) => {
  const [changelog, setChangelog] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Fetch version.json from GitHub (same as updateService)
      const updateCheckUrl = process.env.REACT_APP_UPDATE_CHECK_URL || 'https://raw.githubusercontent.com/Externoak/LaLigaApp/master/version.json';

      fetch(updateCheckUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LaLigaWeb-ChangelogViewer'
        }
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          setVersion(data.version || '');
          setChangelog(data.notes || 'No hay notas de cambios disponibles.');
        })
        .catch((error) => {
          setChangelog('No se pudo cargar el changelog. ' + error.message);
        });
    }
  }, [isOpen]);

  // Parse changelog to create sections
  const parseChangelog = (notes) => {
    if (!notes) return [];

    const lines = notes.split('\n');
    const sections = [];
    let currentSection = null;

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Check if line is a section header (starts with emoji or VERSION keyword)
      if (trimmedLine.match(/^[⏫🔒🎯🔄🆕🚀💰🎨🔧🧹]/)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: trimmedLine,
          items: []
        };
      } else if (currentSection && trimmedLine.startsWith('•')) {
        // This is a bullet point
        currentSection.items.push(trimmedLine.substring(1).trim());
      } else if (currentSection) {
        // This is part of the title or a continuation
        currentSection.title += ' ' + trimmedLine;
      }
    });

    // Add the last section
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  const sections = parseChangelog(changelog);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[80vh] z-50 bg-white dark:bg-dark-card rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-500 rounded-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Registro de Cambios
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Versión {version}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              {sections.length > 0 ? (
                sections.map((section, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 md:p-5 border border-gray-200 dark:border-gray-700"
                  >
                    {/* Section Title */}
                    <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-start gap-2">
                      <span className="flex-shrink-0">{section.title.split(':')[0]}:</span>
                      <span className="text-sm md:text-base font-normal text-gray-700 dark:text-gray-300">
                        {section.title.split(':').slice(1).join(':').trim()}
                      </span>
                    </h3>

                    {/* Section Items */}
                    {section.items.length > 0 && (
                      <ul className="space-y-2">
                        {section.items.map((item, itemIndex) => (
                          <li
                            key={itemIndex}
                            className="flex items-start gap-2 text-sm md:text-base text-gray-700 dark:text-gray-300"
                          >
                            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary-500 mt-2" />
                            <span className="flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Cargando notas de cambios...
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 md:p-6 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-gray-800/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <a
                  href="https://github.com/Externoak/LaLigaApp"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group"
                >
                  <span>Para más información, visita el repositorio en GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChangelogModal;
