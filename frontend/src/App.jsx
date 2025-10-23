import { useState, useEffect, useMemo } from 'react'
import { Moon, Sun, Search, GitCompare, ExternalLink, X } from 'lucide-react'
import clsx from 'clsx'

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  const [featureData, setFeatureData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [fromVersion, setFromVersion] = useState('')
  const [toVersion, setToVersion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState([])
  const [linkCopied, setLinkCopied] = useState(false)

  // Load feature data
  useEffect(() => {
    fetch('/feature_matrix.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load feature data')
        return res.json()
      })
      .then(data => {
        setFeatureData(data)
        // Set default versions to the last two versions (will be overridden by URL params if present)
        if (data.versions.length >= 2) {
          setFromVersion(data.versions[data.versions.length - 2])
          setToVersion(data.versions[data.versions.length - 1])
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Read URL parameters and set versions
  useEffect(() => {
    if (!featureData) return

    const params = new URLSearchParams(window.location.search)
    const fromParam = params.get('from')
    const toParam = params.get('to')

    // Validate and set fromVersion
    if (fromParam && featureData.versions.includes(fromParam)) {
      setFromVersion(fromParam)
    }

    // Validate and set toVersion
    if (toParam && featureData.versions.includes(toParam)) {
      setToVersion(toParam)
    }
  }, [featureData])

  // Update URL when versions change
  useEffect(() => {
    if (!fromVersion || !toVersion) return

    const url = new URL(window.location.href)
    url.searchParams.set('from', fromVersion)
    url.searchParams.set('to', toVersion)

    // Update URL without page reload
    window.history.replaceState({}, '', url)
  }, [fromVersion, toVersion])

  // Theme management
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  // Helper function to compare PostgreSQL versions
  // Handles both old format (8.4, 9.6) and new format (10, 11, 12)
  const compareVersions = (v1, v2) => {
    const v1Idx = featureData?.versions.indexOf(v1)
    const v2Idx = featureData?.versions.indexOf(v2)
    return v1Idx - v2Idx
  }

  // Handle fromVersion change and auto-adjust toVersion if needed
  const handleFromVersionChange = (newFromVersion) => {
    setFromVersion(newFromVersion)
    // If toVersion is now less than or equal to fromVersion, adjust it
    if (compareVersions(toVersion, newFromVersion) <= 0) {
      // Find the next available version
      const fromIdx = featureData.versions.indexOf(newFromVersion)
      if (fromIdx < featureData.versions.length - 1) {
        setToVersion(featureData.versions[fromIdx + 1])
      }
    }
  }

  // Toggle category selection
  const toggleCategory = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        // Remove category if already selected
        return prev.filter(c => c !== category)
      } else {
        // Add category if not selected
        return [...prev, category]
      }
    })
  }

  // Copy comparison link to clipboard
  const copyComparisonLink = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', fromVersion)
    url.searchParams.set('to', toVersion)

    navigator.clipboard.writeText(url.toString())
      .then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000) // Reset after 2 seconds
      })
      .catch(err => {
        console.error('Failed to copy:', err)
      })
  }

  // Handle print with custom filename
  const handlePrint = () => {
    // Save original title
    const originalTitle = document.title

    // Set title for PDF filename
    document.title = `PostgreSQL v${fromVersion} vs v${toVersion} - pgfeaturediff`

    // Print
    window.print()

    // Restore original title after print dialog opens
    // Small timeout to ensure the print dialog uses the new title
    setTimeout(() => {
      document.title = originalTitle
    }, 100)
  }

  // Calculate new and deprecated features
  const { newFeatures, deprecatedFeatures } = useMemo(() => {
    if (!featureData || !fromVersion || !toVersion) return { newFeatures: [], deprecatedFeatures: [] }

    const fromIdx = featureData.versions.indexOf(fromVersion)
    const toIdx = featureData.versions.indexOf(toVersion)

    if (fromIdx >= toIdx) return { newFeatures: [], deprecatedFeatures: [] }

    const newFeats = featureData.features.filter(feature => {
      const introducedIdx = featureData.versions.indexOf(feature.introduced_in)
      return introducedIdx > fromIdx && introducedIdx <= toIdx
    })

    const deprecatedFeats = featureData.features.filter(feature => {
      if (!feature.deprecated_in) return false
      const deprecatedIdx = featureData.versions.indexOf(feature.deprecated_in)
      return deprecatedIdx > fromIdx && deprecatedIdx <= toIdx
    })

    return { newFeatures: newFeats, deprecatedFeatures: deprecatedFeats }
  }, [featureData, fromVersion, toVersion])

  // Get unique categories
  const categories = useMemo(() => {
    if (!featureData) return []
    const cats = new Set(featureData.features.map(f => f.category))
    return ['all', ...Array.from(cats).sort()]
  }, [featureData])

  // Combine and filter features by search and category
  const { filteredNewFeatures, filteredDeprecatedFeatures } = useMemo(() => {
    let newFeats = newFeatures
    let depFeats = deprecatedFeatures

    // Filter by selected categories (if any)
    if (selectedCategories.length > 0) {
      newFeats = newFeats.filter(f => selectedCategories.includes(f.category))
      depFeats = depFeats.filter(f => selectedCategories.includes(f.category))
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      newFeats = newFeats.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)
      )
      depFeats = depFeats.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)
      )
    }

    return { filteredNewFeatures: newFeats, filteredDeprecatedFeatures: depFeats }
  }, [newFeatures, deprecatedFeatures, selectedCategories, searchQuery])

  // Group by category
  const featuresByCategory = useMemo(() => {
    const grouped = {}
    filteredNewFeatures.forEach(feature => {
      if (!grouped[feature.category]) {
        grouped[feature.category] = []
      }
      grouped[feature.category].push({ ...feature, type: 'new' })
    })
    filteredDeprecatedFeatures.forEach(feature => {
      if (!grouped[feature.category]) {
        grouped[feature.category] = []
      }
      grouped[feature.category].push({ ...feature, type: 'deprecated' })
    })
    return grouped
  }, [filteredNewFeatures, filteredDeprecatedFeatures])

  // Calculate category breakdown for summary
  const categorySummary = useMemo(() => {
    const summary = {}

    // Count new features by category
    newFeatures.forEach(feature => {
      if (!summary[feature.category]) {
        summary[feature.category] = { new: 0, deprecated: 0 }
      }
      summary[feature.category].new++
    })

    // Count deprecated features by category
    deprecatedFeatures.forEach(feature => {
      if (!summary[feature.category]) {
        summary[feature.category] = { new: 0, deprecated: 0 }
      }
      summary[feature.category].deprecated++
    })

    // Convert to array and sort by total count (descending)
    return Object.entries(summary)
      .map(([category, counts]) => ({
        category,
        new: counts.new,
        deprecated: counts.deprecated,
        total: counts.new + counts.deprecated
      }))
      .sort((a, b) => b.total - a.total)
  }, [newFeatures, deprecatedFeatures])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-postgres-blue mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading feature data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-600 dark:text-red-400">
          <p className="text-xl font-bold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center space-x-4 hover:opacity-80 transition-opacity">
              <GitCompare className="w-10 h-10 text-postgres-blue" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  pgfeaturediff
                </h1>
                <p className="text-base text-gray-600 dark:text-gray-400">
                  Compare PostgreSQL features between versions
                </p>
              </div>
            </a>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : (
                <Moon className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Version Selectors */}
        <div className="version-selector-section terminal-border terminal-shadow bg-white dark:bg-gray-900 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                From Version
              </label>
              <select
                value={fromVersion}
                onChange={(e) => handleFromVersionChange(e.target.value)}
                className="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-postgres-blue focus:border-transparent transition-colors appearance-none bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`
                }}
              >
                {featureData?.versions.map(v => (
                  <option key={v} value={v}>v{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                To Version
              </label>
              <select
                value={toVersion}
                onChange={(e) => setToVersion(e.target.value)}
                className="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-postgres-blue focus:border-transparent transition-colors appearance-none bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`
                }}
              >
                {featureData?.versions.map(v => {
                  const fromIdx = featureData.versions.indexOf(fromVersion)
                  const vIdx = featureData.versions.indexOf(v)
                  return (
                    <option
                      key={v}
                      value={v}
                      disabled={vIdx <= fromIdx}
                    >
                      v{v}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {/* Copy Link Button */}
          {fromVersion && toVersion && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={copyComparisonLink}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Copy comparison link"
              >
                {linkCopied ? (
                  <>
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-600 dark:text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          )}

          {featureData && fromVersion && toVersion &&
           featureData.versions.indexOf(fromVersion) >= featureData.versions.indexOf(toVersion) && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Please select a "To Version" that is newer than the "From Version"
              </p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="mb-6 flex items-center justify-between comparison-header">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {newFeatures.length} {newFeatures.length === 1 ? 'Feature' : 'Features'} Added
              {deprecatedFeatures.length > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {' • '}{deprecatedFeatures.length} Deprecated
                </span>
              )}
              {fromVersion && toVersion && ` from v${fromVersion} to v${toVersion}`}
            </h2>
            {featureData && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Last updated: {featureData.last_updated}
              </p>
            )}
          </div>

          {/* Print Button */}
          {(filteredNewFeatures.length > 0 || filteredDeprecatedFeatures.length > 0) && (
            <button
              onClick={handlePrint}
              className="print-button flex items-center gap-2 px-4 py-2 bg-postgres-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
              aria-label="Download as PDF"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download PDF
            </button>
          )}
        </div>

        {/* Category Summary */}
        {categorySummary.length > 0 && (
          <div className="mb-8 terminal-border terminal-shadow bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Features by Category
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categorySummary.map(({ category, new: newCount, deprecated: deprecatedCount, total }) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={clsx(
                    "text-left p-3 rounded-lg border-2 transition-all",
                    selectedCategories.includes(category)
                      ? "border-postgres-blue bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {category}
                    </span>
                    <span className="text-lg font-bold text-postgres-blue">
                      {total}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {newCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        {newCount} new
                      </span>
                    )}
                    {deprecatedCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        {deprecatedCount} deprecated
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {selectedCategories.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedCategories.length} {selectedCategories.length === 1 ? 'category' : 'categories'} selected
                </span>
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-sm text-postgres-blue hover:underline"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="search-filters-section terminal-border terminal-shadow bg-white dark:bg-gray-900 p-6 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-postgres-blue focus:border-transparent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Features List */}
        {filteredNewFeatures.length === 0 && filteredDeprecatedFeatures.length === 0 ? (
          <div className="terminal-border terminal-shadow bg-white dark:bg-gray-900 p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              {parseInt(fromVersion) >= parseInt(toVersion)
                ? 'Select a valid version range to see new features'
                : searchQuery || selectedCategory !== 'all'
                ? 'No features match your search criteria'
                : 'No new features found in this version range'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(featuresByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, features]) => (
              <div key={category}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <span className="w-2 h-2 bg-postgres-blue rounded-full mr-3"></span>
                  {category}
                  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-500">
                    ({features.length})
                  </span>
                </h3>
                <div className="grid gap-4">
                  {features.map(feature => (
                    <div
                      key={feature.id}
                      className={clsx(
                        "terminal-border terminal-shadow p-6 transition-all duration-200",
                        feature.type === 'deprecated'
                          ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600"
                          : "bg-white dark:bg-gray-900 hover:border-postgres-blue dark:hover:border-postgres-blue"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className={clsx(
                            "text-lg font-semibold mb-2",
                            feature.type === 'deprecated'
                              ? "text-red-900 dark:text-red-200"
                              : "text-gray-900 dark:text-gray-100"
                          )}>
                            {feature.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                            {feature.type === 'new' ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                                ✓ Added in v{feature.introduced_in}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                                ✗ Deprecated in v{feature.deprecated_in}
                              </span>
                            )}
                          </div>
                        </div>
                        {feature.docs_url && (
                          <a
                            href={feature.docs_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={clsx(
                              "ml-4 p-2 rounded-lg transition-colors",
                              feature.type === 'deprecated'
                                ? "text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
                                : "text-postgres-blue hover:text-postgres-darkblue hover:bg-gray-100 dark:hover:bg-gray-800"
                            )}
                            title="View documentation"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">
              Data sourced from the{' '}
              <a
                href="https://www.postgresql.org/about/featurematrix/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-postgres-blue hover:underline"
              >
                official PostgreSQL Feature Matrix
              </a>
            </p>
            <p>
              Built with ❤️ for the PostgreSQL community by{' '}
              <a
                href="https://precision-recall.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-postgres-blue hover:underline"
              >
                Sebastian Steenssøe
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
