/**

 */
//EVENTHANDLER
console.log("Here");
const eventHandler = new SimpleEventHandler(d3.select('body').node());
const datasource = flaskVariables.datasource;


//VIEWS
let seaDragonViewer, channelList, parallelCoordinates, scatterplot, legend, neighborhoodTable, comparison;

//SERVICES
let dataLayer, colorScheme;

//INSTANCE VARS
let config;
let dataSrcIndex = 0; // dataset id
let k = 3;
let imageChannels = {}; // lookup table between channel id and channel name (for image viewer)
let clusterData;

//Disable right clicking on element
document.getElementById("openseadragon").addEventListener('contextmenu', event => event.preventDefault());


//LOAD DATA
// Data prevent caching on the config file, as it may have been modified
d3.json(`/data/config.json?t=${Date.now()}`).then(function (config) {
    this.config = config;
    return init(config[datasource])
});


// init all views (datatable, seadragon viewer,...)
async function init(conf) {
    console.log('Starting', new Date());
    config = conf;
    //channel information
    for (let idx = 0; idx < config["imageData"].length; idx++) {
        imageChannels[config["imageData"][idx].fullname] = idx;
    }
    //INIT DATA LAYER
    console.log('Starting Init', new Date());
    dataLayer = new DataLayer(config, imageChannels);
    await dataLayer.init();
    colorScheme = new ColorScheme(dataLayer);
    await colorScheme.init();

    comparison = new Comparison(config, colorScheme, dataLayer, eventHandler);
    channelList = new ChannelList(config, dataLayer, eventHandler);
    neighborhoodTable = new NeighborhoodTable(dataLayer, eventHandler);
    legend = new Legend(dataLayer, colorScheme, eventHandler);
    parallelCoordinates = new ParallelCoordinates('parallel_coordinates_display', dataLayer, eventHandler);
    scatterplot = new Scatterplot('scatterplot_display', 'viewer_scatter_canvas', eventHandler, dataLayer, neighborhoodTable);
    console.log('Ending Reg Init', new Date());
    //image viewer
    seaDragonViewer = new ImageViewer(config, dataLayer, eventHandler, colorScheme);
    console.log('Ending Viewer Init', new Date());
    // init synchronus methods
    seaDragonViewer.init();
    legend.init();
    parallelCoordinates.init();
    scatterplot.init();
    console.log('Sync Init', new Date());
    //Async stuff
    await Promise.all([channelList.init(), neighborhoodTable.init(), scatterplot.wrangle()]);
    console.log('Async Init', new Date());
    clusterData = dataLayer.getClusterCells();
    setupColExpand();
    await comparison.init();
}

//feature color map changed in ridge plot
const actionColorTransferChange = (d) => {
    //map to full name
    d.name = dataLayer.getFullChannelName(d.name);
    seaDragonViewer.updateChannelColors(d.name, d.color, d.type);
}
eventHandler.bind(ChannelList.events.COLOR_TRANSFER_CHANGE, actionColorTransferChange);

//feature color map changed in ridge plot
const actionRenderingModeChange = (d) => {
    seaDragonViewer.updateRenderingMode(d);
}
eventHandler.bind(ImageViewer.events.renderingMode, actionRenderingModeChange);


//feature color map changed in ridge plot
const actionChannelsToRenderChange = (d) => {
    d3.select('body').style('cursor', 'progress');

    //map to full name
    d.name = dataLayer.getFullChannelName(d.name);

    //send to image viewer
    seaDragonViewer.updateActiveChannels(d.name, d.selections, d.status);

    d3.select('body').style('cursor', 'default');
}
eventHandler.bind(ChannelList.events.CHANNELS_CHANGE, actionChannelsToRenderChange);

//image region or single cell selection (may needs to be combined with other selection events)
const actionImageClickedMultiSel = (d) => {
    // console.log('actionImageClick3edMultSel');
    d3.select('body').style('cursor', 'progress');
    // add newly clicked item to selection
    // console.log('add to selection');
    if (!Array.isArray(d.selectedItem)) {
        dataLayer.addToCurrentSelection(d.selectedItem, true, d.clearPriors);
    } else {
        dataLayer.addAllToCurrentSelection({'cells': d.selectedItem});
    }
    // cellInformation.selectCell(d.selectedItem);
    updateSeaDragonSelection(true, true);
    d3.select('body').style('cursor', 'default');
}
eventHandler.bind(ImageViewer.events.imageClickedMultiSel, actionImageClickedMultiSel);

const displaySelection = async (d) => {
    let selection = d.selection;
    let selectionSource = d.selectionSource || "Image";
    document.getElementById('neighborhood_current_selection').textContent = selectionSource;
    document.getElementById('neighborhood_current_selection_count').textContent = _.size(selection.cells);
    dataLayer.addAllToCurrentSelection(selection);
    parallelCoordinates.wrangle(selection);
    scatterplot.recolor();
    updateSeaDragonSelection(false, false);
}
eventHandler.bind(ImageViewer.events.displaySelection, displaySelection);

const displayNeighborhoodSelection = async (selection) => {
    dataLayer.addAllToCurrentSelection(selection);
    document.getElementById('neighborhood_current_selection').textContent = 'Phenotype';
    document.getElementById('neighborhood_current_selection_count').textContent = _.size(selection.cells);
    // let starplotData = _.get(selection, 'cluster_summary.weighted_contribution');
    if (selection) {
        parallelCoordinates.wrangle(selection);
        scatterplot.recolor();
    }
    updateSeaDragonSelection(false, false);
}
eventHandler.bind(ImageViewer.events.displayNeighborhoodSelection, displayNeighborhoodSelection);

const selectNeighborhood = async (d) => {
    let selection = await dataLayer.getNeighborhood(d[0]);
    if (d[3] === "Lasso") {
        selection = await scatterplot.applyLasso(selection);
    }
    document.getElementById('neighborhood_current_selection').textContent = 'Cluster';
    document.getElementById('neighborhood_current_selection_count').textContent = _.size(selection.cells);
    dataLayer.addAllToCurrentSelection(selection);
    // let starplotData = _.get(selection, 'cluster_summary.weighted_contribution', []);
    parallelCoordinates.wrangle(selection);
    scatterplot.recolor();
    updateSeaDragonSelection(false, false);

}
eventHandler.bind(NeighborhoodTable.events.selectNeighborhood, selectNeighborhood);

const changeSelectionMode = (singleCellMode) => {
    // dataLayer.switchViewMode(singleCellMode);
    // updateSeaDragonSelection(false, false);
}
eventHandler.bind(ImageViewer.events.changeSelectionMode, changeSelectionMode);


eventHandler.bind(Scatterplot.events.selectFromEmbedding, displaySelection);

// const computeCellNeighborhood = async ({distance, selectedCell}) => {
//     let neighborhood = await dataLayer.getIndividualNeighborhood(distance, selectedCell);
//     displayNeighborhood(selectedCell, neighborhood);
// }
// eventHandler.bind(CellInformation.events.computeNeighborhood, computeCellNeighborhood);

// const drawNeighborhoodRadius = async ({distance, selectedCell, dragging}) => {
//     seaDragonViewer.drawCellRadius(distance, selectedCell, dragging);
// }
// eventHandler.bind(CellInformation.events.drawNeighborhoodRadius, drawNeighborhoodRadius);

// For channel select click event
const channelSelect = async (sels) => {
    let channelCells = await dataLayer.getChannelCellIds(sels);
    dataLayer.addAllToCurrentSelection({'cells': channelCells});
    updateSeaDragonSelection(true, false);
}
eventHandler.bind(ChannelList.events.CHANNEL_SELECT, channelSelect);


//current fast solution for seadragon updates
function updateSeaDragonSelection(showCellInfoPanel = false, repaint = true) {
    neighborhoodTable.enableSaveButton();
    seaDragonViewer.updateSelection(dataLayer.getCurrentSelection());
    seaDragonViewer.updateSelection(dataLayer.getCurrentSelection(), repaint);
    comparison.rewrangle();
}

//feature range selection changed in ridge plot
const actionFeatureGatingChange = (d) => {
    // console.log("gating event received");
    seaDragonViewer.updateChannelRange(dataLayer.getFullChannelName(d.name), d.dataRange[0], d.dataRange[1]);
}
eventHandler.bind(ChannelList.events.BRUSH_END, actionFeatureGatingChange);

const selectPhenotype = async (phenotype) => {
    let cells = await dataLayer.getNeighborhoodByPhenotype(phenotype);
    await displayNeighborhoodSelection(cells);
}
eventHandler.bind(Legend.events.selectPhenotype, selectPhenotype);

const selectPhenotypePair = async (d) => {
    console.log(d);
    let phenotypes = [d.row, d.col];
    let selection = null;
    if (d.plotName != 'overall') {
        selection = dataLayer.getCurrentRawSelection();
    }
    let cells = await dataLayer.getNeighborhoodByPhenotype(phenotypes, selection);
    await displayNeighborhoodSelection(cells);
}
eventHandler.bind(Heatmap.events.selectPhenotypePair, selectPhenotypePair);


function displayNeighborhood(selectedCell, neighborhood) {
    dataLayer.addAllToCurrentSelection({'cells': neighborhood});
    dataLayer.addToCurrentSelection(selectedCell, false, false);
    updateSeaDragonSelection(true, true);
}

function showHideRHS() {

    let osd_wrapper = document.getElementById('openseadragon_wrapper');
    let neighborhood_wrapper = document.getElementById('neighborhood_wrapper');
    let expand_wrapper = document.getElementById('expand_wrapper');
    let expand_icon = document.getElementById('expand_icon');
    if (osd_wrapper.classList.contains("openseadragon_wrapper_large")) {
        osd_wrapper.classList.remove("openseadragon_wrapper_large");
        osd_wrapper.classList.add("openseadragon_wrapper_small");
        neighborhood_wrapper.classList.remove("neighborhood_wrapper_small");
        neighborhood_wrapper.classList.add("neighborhood_wrapper_large");
        expand_wrapper.classList.remove('expand_wrapper_right');
        expand_wrapper.classList.add('expand_wrapper_left');
        expand_icon.innerText = 'keyboard_double_arrow_right';
    } else {
        osd_wrapper.classList.add("openseadragon_wrapper_large");
        osd_wrapper.classList.remove("openseadragon_wrapper_small");
        neighborhood_wrapper.classList.add("neighborhood_wrapper_small");
        neighborhood_wrapper.classList.remove("neighborhood_wrapper_large");
        expand_wrapper.classList.remove('expand_wrapper_left');
        expand_wrapper.classList.add('expand_wrapper_right');
        expand_icon.innerText = 'keyboard_double_arrow_left';
    }
    comparison.draw();


}

function setupColExpand() {
    document.getElementById('expand_icon').addEventListener("click", () => {
        showHideRHS();
    })
}