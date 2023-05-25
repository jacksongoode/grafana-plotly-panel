import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { getTemplateSrv, locationService } from '@grafana/runtime';
import { SimpleOptions, defaults } from 'types';
import merge from 'deepmerge';
import _ from 'lodash';
import { saveAs } from 'file-saver';

import Plotly, { toImage, Icons, PlotlyHTMLElement } from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
const Plot = createPlotlyComponent(Plotly);

// Declare Plotly as global
declare global {
  interface Window {
    Plotly: any;
  }
}

window.Plotly = Plotly;
// window.LocationSrv = getLocationSrv();
let templateSrv: any = getTemplateSrv();

interface Props extends PanelProps<SimpleOptions> {}

export class SimplePanel extends PureComponent<Props> {
  render() {
    // Get all variables
    const context = {
      __from: this.props.replaceVariables('$__from'),
      __to: this.props.replaceVariables('$__to'),
      __interval: this.props.replaceVariables('$__interval'),
      __interval_ms: this.props.replaceVariables('$__interval_ms'),
    } as any;
    templateSrv.getVariables().forEach((elt: any) => {
      context[elt.name] = elt.current.text;
    });

    let config = this.props.options.config || defaults.config;
    let data = this.props.options.data || defaults.data;
    let layout = this.props.options.layout || defaults.layout;
    let frames = this.props.options.frames || defaults.frames;

    // Multiply by 2 for higher resolution image
    const resScale = this.props.options.resScale;
    const width = this.props.width * resScale;
    const height = this.props.height * resScale;

    const getFilename = (el: any) => {
      let panelContent = el.closest('div[class*="-panel-content"]');
      let siblingAbove = panelContent.previousElementSibling;
      let h6 = siblingAbove.querySelector('h6');
      return h6.textContent.trim();
    };
    const title = getFilename(this) || this.props.title;

    // Fixes Plotly download issues
    const handleImageDownload = (gd: PlotlyHTMLElement) =>
      toImage(gd, { format: 'png', width, height }).then((data: any) => saveAs(data, title));

    let parameters: any;
    parameters = { data: data, layout: layout, config: config };

    let error: any;
    try {
      if (this.props.options.script !== '' && this.props.data.state !== 'Error') {
        let f = new Function('data, variables, parameters', this.props.options.script);
        parameters = f(this.props.data, context, parameters);
        if (!parameters || typeof parameters === 'undefined') {
          throw new Error('Script must return values!');
        }
      }
    } catch (e) {
      // Can't update chart when script is changing
      error = e;
      console.error(e);
    }

    const combineMerge = (target: any, source: any, options: any) => {
      const destination = target.slice();

      source.forEach((item: any, index: any) => {
        if (typeof destination[index] === 'undefined') {
          destination[index] = options.cloneUnlessOtherwiseSpecified(item, options);
        } else if (options.isMergeableObject(item)) {
          destination[index] = merge(target[index], item, options);
        } else if (target.indexOf(item) === -1) {
          destination.push(item);
        }
      });
      return destination;
    };

    // Set defaults
    layout = { ...layout, autosize: true, height: this.props.height };
    config = {
      ...config,
      modeBarButtonsToAdd: [
        {
          name: 'toImageGrafana' + _.uniqueId(),
          title: 'Export plot as an image',
          icon: Icons.camera,
          click: handleImageDownload,
        },
      ],
      modeBarButtonsToRemove: ['toImage'],
      displaylogo: false,
    };

    // Convert data to array if not an array
    if (data.constructor === Object) {
      if (parameters.data.constructor === Array) {
        data = Array(parameters.data.length).fill(data);
      }
    }

    let display: any;
    if (error) {
      let matches = error.stack.match(/anonymous>:.*\)/m);
      let lines = matches ? matches[0].slice(0, -1).split(':') : null;
      if ('series' in data && data.series.length === 0) {
        display = (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <h4 style={{ margin: 'auto 1em' }}>No data in selected range or source</h4>
          </div>
        );
      } else {
        display = (
          <div>
            <p>There&apos;s an error in your script:</p>
            <p>
              <code style={{ color: '#D00' }}>
                {error.toString()} {lines ? '- line ' + (parseInt(lines[1], 10) - 2) + ':' + lines[2] : ''}
              </code>
            </p>
            <p>Check your console for more details</p>
          </div>
        );
      }
    } else {
      display = (
        <Plot
          style={{ width: '100%', height: '100%' }}
          data={parameters.data ? merge(data, parameters.data, { arrayMerge: combineMerge }) : data}
          frames={parameters.frames ? merge(data, parameters.frames, { arrayMerge: combineMerge }) : frames}
          onInitialized={(figure: any, graphDiv: any) => this.setState({ figure: figure, graphDiv: graphDiv })}
          layout={parameters.layout ? merge(layout, parameters.layout) : layout}
          config={parameters.config ? merge(config, parameters.config) : config}
          useResizeHandler={true}
          onClick={(data) => {
            let f = new Function('data', 'locationService', 'getTemplateSrv', this.props.options.onclick);
            f(data, locationService, getTemplateSrv);
          }}
        ></Plot>
      );
    }
    return display;
  }
}
