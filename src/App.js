import React, {useState} from 'react';
import Papa from 'papaparse';
import _ from 'lodash';

// Domain models
class AtomicFormula {
    constructor(carbon = 0, hydrogen = 0, nitrogen = 0, oxygen = 0, sulfur = 0, phosphorus = 0, chlorine = 0) {
        this.carbon = carbon;
        this.hydrogen = hydrogen;
        this.nitrogen = nitrogen;
        this.oxygen = oxygen;
        this.sulfur = sulfur;
        this.phosphorus = phosphorus;
        this.chlorine = chlorine;
    }

    add(other) {
        return new AtomicFormula(this.carbon + other.carbon, this.hydrogen + other.hydrogen, this.nitrogen + other.nitrogen, this.oxygen + other.oxygen, this.sulfur + other.sulfur, this.phosphorus + other.phosphorus, this.chlorine + other.chlorine);
    }

    toFormulaString() {
        return `C${this.carbon}H${this.hydrogen}Cl${this.chlorine}N${this.nitrogen}O${this.oxygen}P${this.phosphorus}S${this.sulfur}`;
    }

    static parseFormulaString(formula) {
        const pattern = /([A-Z][a-z]?)(-?\d*)/g;
        const atoms = {};
        let match;

        while ((match = pattern.exec(formula)) !== null) {
            atoms[match[1]] = parseInt(match[2]) || 0;
        }

        return new AtomicFormula(atoms['C'] || 0, atoms['H'] || 0, atoms['N'] || 0, atoms['O'] || 0, atoms['S'] || 0, atoms['P'] || 0, atoms['Cl'] || 0);
    }
}

const MolecularMatcher = () => {
    const [formulas, setFormulas] = useState([]);
    const [corrections, setCorrections] = useState([]);
    const [results, setResults] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState({key: 'id', direction: 'asc'});
    const [selectedId, setSelectedId] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [processProgress, setProcessProgress] = useState({current: 0, total: 0});
    const [isProcessing, setIsProcessing] = useState(false);
    const formulaFileRef = React.useRef(null);
    const correctionFileRef = React.useRef(null);

    const validateCSVStructure = (headers) => {
        const requiredColumns = ['ID', 'formulas'];
        const missingColumns = requiredColumns.filter(col => !headers.some(header => header.trim() === col));

        if (missingColumns.length > 0) {
            return {
                isValid: false, message: `Missing required column(s): ${missingColumns.join(', ')}`
            };
        }
        return {isValid: true};
    };

    const handleFormulaFile = (event) => {
        const file = event.target.files[0];
        setError(null);
        setIsLoading(true);

        if (file) {
            Papa.parse(file, {
                delimiter: ';', header: true, skipEmptyLines: true, complete: (results) => {
                    // First validate CSV structure
                    const validationResult = validateCSVStructure(results.meta.fields);
                    if (!validationResult.isValid) {
                        setError(validationResult.message);
                        setFormulas([]);
                        setIsLoading(false);
                        return;
                    }

                    try {
                        const parsedFormulas = results.data
                            .filter(row => row['ID'] && row['formulas'])
                            .map(row => ({
                                id: row['ID'].toString(),
                                originalFormula: AtomicFormula.parseFormulaString(row['formulas']?.trim() || '')
                            }));

                        if (parsedFormulas.length === 0) {
                            setError('No valid formulas found in the CSV file');
                            setIsLoading(false);
                            return;
                        }

                        setFormulas(parsedFormulas);
                        setIsLoading(false);
                    } catch (e) {
                        console.error('Error parsing formulas:', e);
                        setError(e.message);
                        setFormulas([]);
                        setIsLoading(false);
                    }
                }, error: (error) => {
                    console.error('CSV parse error:', error);
                    setError(`Error parsing CSV file: ${error.message}`);
                    setFormulas([]);
                    setIsLoading(false);
                }
            });
        }
    };

    const handleCorrectionFile = async (event) => {
        const file = event.target.files[0];
        setError(null);
        setIsLoading(true);

        if (file) {
            try {
                const text = await file.text();

                const correctionFormulas = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(formula => {
                        return {formula: AtomicFormula.parseFormulaString(formula)};
                    });

                setCorrections(correctionFormulas);
                setIsLoading(false);
            } catch (e) {
                console.error('Error parsing corrections:', e);
                setError(`Error parsing corrections file: ${e.message}`);
                setCorrections([]);
                setIsLoading(false);
            }
        }
    };

    const applyCorrections = () => {
        if (formulas.length === 0 || corrections.length === 0) {
            setError('No formulas or corrections loaded');
            return;
        }

        setIsLoading(true);
        setProcessProgress({current: 0, total: formulas.length});
        setIsProcessing(true);

        // Use setTimeout to allow UI to update before processing starts
        setTimeout(() => {
            try {
                // Create lookup map for formulas
                const formulasByFormula = new Map();
                formulas.forEach(c => {
                    formulasByFormula.set(c.originalFormula.toFormulaString(), c);
                });

                const newResults = [];
                const batchSize = 100;
                let processed = 0;

                // Process formulas in batches
                for (let i = 0; i < formulas.length; i += batchSize) {
                    const batchFormulas = formulas.slice(i, Math.min(i + batchSize, formulas.length));

                    batchFormulas.forEach(formula => {
                        const originalFormula = formula.originalFormula;

                        corrections.forEach(correction => {
                            const correctedFormula = originalFormula.add(correction.formula);
                            const correctedFormulaString = correctedFormula.toFormulaString();

                            const matchedFormula = formulasByFormula.get(correctedFormulaString);
                            if (matchedFormula && matchedFormula.id !== formula.id) {
                                newResults.push({
                                    originalEntry: formula,
                                    matchedEntry: matchedFormula,
                                    appliedCorrection: correction.formula
                                });
                            }
                        });
                    });
                }

                console.log(`Found ${newResults.length} matches`);
                setResults(newResults);
                setProcessProgress(prev => ({...prev, current: formulas.length}));
            } catch (error) {
                console.error('Error applying corrections:', error);
                setError('Error applying corrections: ' + error.message);
            } finally {
                setIsLoading(false);
                setIsProcessing(false);
            }
        }, 0);
    };

    const handleSort = (key) => {
        setSortConfig({
            key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
        });
    };

    const scrollToId = (targetId) => {
        const element = document.getElementById(`formula-${targetId}`);
        if (element) {
            element.scrollIntoView({behavior: 'smooth', block: 'center'});
            setSelectedId(targetId);
            setTimeout(() => setSelectedId(null), 2000);
        }
    };

    const sortedFormulas = React.useMemo(() => {
        return _.orderBy(formulas.filter(formula => {
            if (!formula || !formula.id || !formula.originalFormula) return false;
            const searchLower = searchQuery.toLowerCase();
            return (formula.id.toString().toLowerCase().includes(searchLower) || formula.originalFormula.toFormulaString().toLowerCase().includes(searchLower));
        }), [formula => {
            switch (sortConfig.key) {
                case 'id':
                    return parseInt(formula.id, 10);  // Convert string ID to number
                case 'mz':
                    return formula.mz;
                case 'formula':
                    return formula.originalFormula.toFormulaString();
                case 'matches':
                    return results.filter(r => r.originalEntry.id === formula.id).length;
                default:
                    return parseInt(formula.id, 10);  // Convert string ID to number for default case too
            }
        }], [sortConfig.direction]);
    }, [formulas, searchQuery, sortConfig, results]);

    const exportToCSV = () => {
        // Prepare data for export
        const exportData = sortedFormulas.map(formula => {
            const matchesForFormula = results.filter(r => r.originalEntry.id === formula.id);

            return {
                ID: formula.id,
                "Original Formula": formula.originalFormula.toFormulaString(),
                "Number of Matches": matchesForFormula.length,
                "Matches": matchesForFormula.length > 0
                    ? '[' + matchesForFormula.map(match =>
                    `correction = ${match.appliedCorrection.toFormulaString()} result = (ID ${match.matchedEntry.id}) ${match.matchedEntry.originalFormula.toFormulaString()}`
                ).join(', ') + ']'
                    : ''
            };
        });

        // Convert to CSV
        const csv = Papa.unparse(exportData, {delimiter: ";"});

        // Create blob and download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const date = new Date();
            const dateStr = date.getFullYear() + '_' +
                String(date.getMonth() + 1).padStart(2, '0') + '_' +
                String(date.getDate()).padStart(2, '0') + '-' +
                String(date.getHours()).padStart(2, '0') + '_' +
                String(date.getMinutes()).padStart(2, '0') + '_' +
                String(date.getSeconds()).padStart(2, '0');
            link.setAttribute('download', `matches_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const resetAll = () => {
        setFormulas([]);
        setCorrections([]);
        setResults([]);
        setSearchQuery('');
        setSortConfig({ key: 'id', direction: 'asc' });
        setSelectedId(null);
        setError(null);
        setIsLoading(false);
        setProcessProgress({ current: 0, total: 0 });
        setIsProcessing(false);

        // Reset file inputs
        if (formulaFileRef.current) {
            formulaFileRef.current.value = '';
        }
        if (correctionFileRef.current) {
            correctionFileRef.current.value = '';
        }
    };

    return (<div className="container mx-auto p-4">
            <h1 className="text-xl font-bold mb-4">Formula Correction</h1>

            {error && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-6 w-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd"
                                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                          clipRule="evenodd"/>
                                </svg>
                            </div>
                            <div className="ml-3 w-full">
                                <h3 className="text-lg font-medium text-gray-900">Error</h3>
                                <div className="mt-2 text-sm text-gray-500">
                                    <p>{error}</p>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setError(null)}
                                        className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>)}

            <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">
                    <strong>File Input Guidelines:</strong> For the Formula CSV, use a semicolon-separated file with columns 'ID' and 'formulas'. Formulas should be in the format {'C{10}H{20}N{2}O{5}S{1}P{1}Cl{0}'}, where the numbers in curly braces represent the count of each atom type. The Corrections TXT file should contain one formula correction per line, using the same format.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block mb-2 font-medium">
                            Formula CSV
                            {formulas.length > 0 && (<span className="ml-2 text-sm text-gray-600">
                                    ({formulas.length} formulas parsed)
                                </span>)}
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <input
                                    ref={formulaFileRef}
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFormulaFile}
                                    disabled={isLoading}
                                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-500 file:text-white hover:file:bg-blue-600 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block mb-2 font-medium">
                            Corrections TXT
                            {corrections.length > 0 && (<span className="ml-2 text-sm text-gray-600">
                                    ({corrections.length} corrections parsed)
                                </span>)}
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <input
                                    ref={correctionFileRef}
                                    type="file"
                                    accept=".txt"
                                    onChange={handleCorrectionFile}
                                    disabled={isLoading}
                                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-500 file:text-white hover:file:bg-blue-600 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 mb-4">
                    <button
                        onClick={applyCorrections}
                        disabled={!formulas.length || !corrections.length || isLoading}
                        className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <span className="flex items-center">
                                Processing...
                                <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>
                            </span>
                        ) : (
                            'Apply Corrections'
                        )}
                    </button>

                    <button
                        onClick={exportToCSV}
                        disabled={!sortedFormulas.length}
                        className="px-4 py-2 text-white bg-green-500 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Export to CSV
                    </button>

                    <button
                        onClick={resetAll}
                        className="px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600"
                    >
                        Reset
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Search by ID or formula..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-2 border rounded mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />

                <div className="border rounded shadow">
                    <div className="bg-gray-100 border-b flex">
                        {['ID', 'Original Formula', 'Matches Found'].map((header, index) => (<div
                                key={header}
                                onClick={() => handleSort(['id', 'formula', 'matches'][index])}
                                className={`px-6 py-3 text-left text-sm font-semibold cursor-pointer hover:bg-gray-200 ${index === 0 ? 'w-32' : index === 1 ? 'w-32' : index === 2 ? 'w-64' : 'flex-grow'}`}
                            >
                                <div className="flex items-center">
                                    {header}
                                    <span className="ml-2">
                                        {sortConfig.key === ['id', 'formula', 'matches'][index] && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </span>
                                </div>
                            </div>))}
                    </div>

                    <div style={{height: 'calc(75vh - 200px)', overflow: 'auto'}}>
                        {sortedFormulas.map((formula) => {
                            const matchesForFormula = results.filter(r => r.originalEntry.id === formula.id);
                            const matchCount = matchesForFormula.length;

                            return (<div
                                    key={formula.id}
                                    id={`formula-${formula.id}`}
                                    className={`flex border-b ${selectedId === formula.id ? 'bg-blue-200' : matchCount === 0 ? 'bg-white hover:bg-gray-50' : matchCount === 1 ? 'bg-blue-50 hover:bg-blue-100' : 'bg-blue-50 hover:bg-blue-100'}`}
                                >
                                    <div className="px-6 py-4 text-sm w-32 flex-shrink-0">{formula.id}</div>
                                    <div className="px-6 py-4 text-sm font-mono w-64 flex-shrink-0">
                                        {formula.originalFormula.toFormulaString()}
                                    </div>
                                    <div className="px-6 py-4 text-sm flex-grow">
                                        {matchCount === 0 ? (<span className="text-gray-500">-</span>) : (
                                            <ul className="space-y-2">
                                                {matchesForFormula.map((match, idx) => (
                                                    <li key={`${formula.id}-${idx}`} className="flex items-start">
                                                        <span className="mr-2">•</span>
                                                        <span>
                                                            Applied <span className="font-mono font-medium">
                                                                {match.appliedCorrection.toFormulaString()}
                                                            </span>
                                                            {' → '}
                                                            <span className="font-mono font-medium">
                                                                {match.matchedEntry.originalFormula.toFormulaString()}
                                                            </span>
                                                            {' '}
                                                            <span
                                                                className="text-blue-600 hover:text-blue-800 cursor-pointer underline"
                                                                onClick={() => scrollToId(match.matchedEntry.id)}
                                                            >
                                                                (ID: {match.matchedEntry.id})
                                                            </span>
                                                        </span>
                                                    </li>))}
                                            </ul>)}
                                    </div>
                                </div>);
                        })}
                    </div>

                    {/* Stats footer */}
                    <div className="p-4 border-t">
                        <div className="text-sm text-gray-500">
                            Showing {sortedFormulas.length} formulas with {results.length} total matches
                        </div>
                    </div>
                </div>
            </div>
        </div>);
};

export default MolecularMatcher;
