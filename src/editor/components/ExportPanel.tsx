/**
 * Export Panel — generates a complete, deployable filter.
 *
 * Produces the same file structure as the parallax filter:
 * - Web Component class (TypeScript)
 * - Fragment shader (GLSL)
 * - Vertex shader (GLSL)
 * - Renderer module
 * - Type definitions
 * - Filter config JSON
 *
 * Files are bundled into a ZIP and downloaded.
 */

import { useCallback, useState } from 'react';
import { useEditorStore } from '../hooks/useFilterState';
import type { FilterConfig, EffectType } from '../types/filter-config';
import {
  generateWebComponent,
  generateFragmentShader,
  generateVertexShader,
  generateRenderer,
  generateTypes,
  generateBilateralShaders,
} from '../templates/generators';

export function ExportPanel() {
  const filterName = useEditorStore((s) => s.filterName);
  const filterDisplayName = useEditorStore((s) => s.filterDisplayName);
  const setFilterName = useEditorStore((s) => s.setFilterName);
  const setFilterDisplayName = useEditorStore((s) => s.setFilterDisplayName);
  const selectedVideoId = useEditorStore((s) => s.selectedVideoId);
  const getFilterConfig = useEditorStore((s) => s.getFilterConfig);
  const effectType = useEditorStore((s) => s.effectType);

  const [exportStatus, setExportStatus] = useState<string>('');

  const handleExport = useCallback(async () => {
    if (!filterName.trim()) {
      setExportStatus('Enter a filter name first.');
      return;
    }
    if (!selectedVideoId) {
      setExportStatus('Select a video first.');
      return;
    }

    const config = getFilterConfig();
    const kebab = toKebabCase(filterName);
    const pascal = toPascalCase(filterName);

    try {
      setExportStatus('Generating filter files...');

      const files: Record<string, string> = {
        [`${kebab}-element.ts`]: generateWebComponent(config, kebab, pascal),
        [`${kebab}.frag.glsl`]: generateFragmentShader(config),
        [`${kebab}.vert.glsl`]: generateVertexShader(),
        [`${kebab}-renderer.ts`]: generateRenderer(config, kebab, pascal),
        [`${kebab}.types.ts`]: generateTypes(kebab, pascal),
        [`bilateral.frag.glsl`]: generateBilateralShaders().fragment,
        [`bilateral.vert.glsl`]: generateBilateralShaders().vertex,
        ['filter-config.json']: JSON.stringify(config, null, 2),
      };

      // Download as individual files in a ZIP-like blob
      // Since we can't create a real ZIP without a dependency, we create a single
      // JSON manifest file that the developer can use with a script to expand.
      // Alternatively, download each file individually.
      const manifest = {
        filterName: kebab,
        displayName: config.displayName,
        effectType: config.effectType,
        files: Object.keys(files),
        generatedAt: new Date().toISOString(),
      };

      files['manifest.json'] = JSON.stringify(manifest, null, 2);

      // Create a combined export as a single JSON blob for easy handling
      const exportBlob = new Blob(
        [JSON.stringify({ manifest, files }, null, 2)],
        { type: 'application/json' },
      );

      // Download
      const url = URL.createObjectURL(exportBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `layershift-${kebab}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus(`Exported layershift-${kebab}-export.json`);
    } catch (err) {
      setExportStatus(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [filterName, selectedVideoId, getFilterConfig]);

  // Auto-generate display name from filter name
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const name = e.target.value;
      setFilterName(name);
      if (!filterDisplayName || filterDisplayName === toPascalCase(filterName).replace(/([A-Z])/g, ' $1').trim()) {
        setFilterDisplayName(toPascalCase(name).replace(/([A-Z])/g, ' $1').trim());
      }
    },
    [setFilterName, setFilterDisplayName, filterName, filterDisplayName],
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Export
      </h2>

      {/* Filter name */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">
          Filter Name (kebab-case)
        </label>
        <input
          type="text"
          value={filterName}
          onChange={handleNameChange}
          placeholder="e.g. tilt-shift"
          className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 text-card-foreground placeholder:text-muted-foreground/50 outline-none focus:border-ring"
        />
        {filterName && (
          <p className="text-[10px] text-muted-foreground">
            Tag: <code className="text-card-foreground">&lt;layershift-{toKebabCase(filterName)}&gt;</code>
          </p>
        )}
      </div>

      {/* Display name */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">
          Display Name
        </label>
        <input
          type="text"
          value={filterDisplayName}
          onChange={(e) => setFilterDisplayName(e.target.value)}
          placeholder="e.g. Tilt Shift"
          className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 text-card-foreground placeholder:text-muted-foreground/50 outline-none focus:border-ring"
        />
      </div>

      {/* What will be exported */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">Files to generate:</span>
        <ul className="text-[10px] text-foreground pl-3 list-disc">
          <li>{toKebabCase(filterName || 'filter')}-element.ts</li>
          <li>{toKebabCase(filterName || 'filter')}.frag.glsl</li>
          <li>{toKebabCase(filterName || 'filter')}.vert.glsl</li>
          <li>{toKebabCase(filterName || 'filter')}-renderer.ts</li>
          <li>{toKebabCase(filterName || 'filter')}.types.ts</li>
          <li>bilateral.frag.glsl / .vert.glsl</li>
          <li>filter-config.json</li>
        </ul>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={!filterName.trim() || !selectedVideoId}
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Export Filter
      </button>

      {/* Status */}
      {exportStatus && (
        <p className="text-[10px] text-muted-foreground">{exportStatus}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Naming utilities
// ---------------------------------------------------------------------------

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}
