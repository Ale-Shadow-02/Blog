// Support JS for 'request' queries 
let formData = {};

let dataCache = {
		list: [],
		total: 0,
		period: '',
		code: '',
		listName: '',
		filters: {},
		filtered: [],
		sort: '',
		display: function() {
				dataCache.code = document.getElementById('sendquery').dataset.code;
				dataCache.listName = document.querySelector('.report.body').dataset.var;
				formData = collectForm();
				if ( dataCache.period === formData.begin + formData.end ) {
					dataCache.readCache().then( gotData );
				} else {
					formData.from = 1;
					flush({ 'code': dataCache.code,
							'data': formData },
							location.origin + window.realpath, dataCache.initCache ); // Make initial request
				}
			},
		initCache: function(resp) {
				if (resp.match(/^[\{\[]/)) resp = JSON.parse(resp);
				if (resp.fail) {
					console.log(resp.fail)
				} else if ( 'begin-dd' in resp.data ) {
					formData.begin = resp.data['begin-dd'].replace(/^(\d{2})\D(\d{2})\D(\d{4})$/,'$3$2$1');
					formData.end = resp.data['end-dd'].replace(/^(\d{2})\D(\d{2})\D(\d{4})$/,'$3$2$1');
					upDataInput('begin', formData.begin);
					upDataInput('end', formData.end);
				}
				gotData(resp.data);			// Draw received data
				if ( resp.data.quantity > 0 ) {
					formData.from = 1;		// Reset current page shown
					let askHost = {'code': dataCache.code, 'data': objectClone(formData)};
					askHost.data.koldoc = resp.data.quantity;
					flush( askHost,
						location.origin + window.realpath, dataCache.fillCache);
				}	// Fill cache with All-of-period
			},
		fillCache: function(resp) {
				if (resp.match(/^[\{\[]/)) resp = JSON.parse(resp);
				if (resp.fail) console.log(resp.fail);
				dataCache.period = formData.begin + formData.end;
				dataCache.total = resp.data.quantity;
				dataCache.list = resp.data[dataCache.listName];
				dataCache.sort = '';
				dataCache.filters = {};
				dataCache.filtered = [];
			},
		readCache: async function() {

			let filters = {};
			document.querySelectorAll('input[data-filter]').forEach( fi =>{ 
							if (fi.value.replace(/\s+/g,'').length > 0) {
								let Rx = fi.value.replace(/\s+/g, '\s*');
								filters[ fi.dataset.filter ] = new RegExp( Rx, 'i');
							}
						});

			if ( !filters.isEqual( dataCache.filters) || dataCache.filtered.length === 0 ) {
				if ( dataCache.filtered.length > 0) formData.from = 1;
				dataCache.sort = '';
				dataCache.filters = filters;
				dataCache.filtered = dataCache.list.grep( itm =>{
						let ret = true;
						for ( const fk of Object.keys( dataCache.filters) ) {		// Apply all of values on AND scheme
							let [fkey, fopt] = fk.split(':');	// Special processing for list of values
							let found = itm.findKey(fkey);
							if ( found.length > 0 ) {
								if ( fopt ) {
									let match = '';
									switch(fopt) {
										case '-1':
											match = found.pop();
											break;
										case '0':
											match = found.shift()
											break;
									}
									ret = (ret && match.match( dataCache.filters[`${fkey}:${fopt}`]));
								} else {
									ret = ( ret && found.find( fv =>{ return ( fv.match( dataCache.filters[fkey])) }) );
								}
							} else {
								return false;
							}
						}			// Keys forEach
						return ret;
					});			// Grep from cache
			}		// Need to be updated?
						
			let toSort = document.querySelector('.active[data-sort]');
			if ( toSort && dataCache.sort != toSort.dataset.sort + toSort.ord ) {
				dataCache.filtered.sort( (a, b) =>{ 
										let ret = 0;
										let valA = a.findKey(toSort.dataset.sort)[0] || '';
										let valB = b.findKey(toSort.dataset.sort)[0] || '';
										if ( valA === valB ) return ret;
										if ( typeof(valA) === 'number' 
												&& typeof(valB) === 'number' ) {	// FCK JS sort() compares strings!
											ret = valA - valB
										} else {
											let cmp = [valA, valB].sort()[0];
											if ( cmp === valA ) {
												ret = -1;
											} else if ( cmp === valB ) {
												ret = 1;
											}
										}
										return ret;
									});
				if ( toSort.matches('.dsc') ) dataCache.filtered.reverse();
				dataCache.sort = toSort.dataset.sort + toSort.ord;
			}

			let listOut = [];
			for ( nRec = 0; nRec < formData.koldoc; nRec++) {
				let idx = formData.from + nRec -1;
				if ( !dataCache.filtered[idx] ) break;
				listOut.push( dataCache.filtered[idx] );
			}
			let toShow = {'quantity': dataCache.filtered.length};		// Total filtered items
			toShow[dataCache.listName + '-nn'] = listOut.length;	// Length of page
			toShow[dataCache.listName] = listOut;				// List content
			return toShow;
		}
	};


let monthSwitch = function(evt) {			// Whole month select switch
		let mn = evt.target;
		if ( mn.dataset.begin && mn.dataset.end ) {
			document.querySelector('input.udata[data-key="begin"]').value = mn.dataset.begin;
			document.querySelector('input.udata[data-key="end"]').value = mn.dataset.end;
			document.querySelector('input.udata[data-key="from"]').value = 1;
			document.getElementById('sendquery').click();		// Send query activate
		}
	};

let pageSwitch = function(evt) {			// Paginator switch reactor
		let page = evt.target;
		if ( page.matches('.active') ) return;
		evt.stopImmediatePropagation();
		let toPage = 1;
		if ( page.matches('.skip') ) {
			let pC = parseInt(page.parentNode.querySelector('li.page-item.active:not(.skip)').dataset.page);	// pageCurrent
			if ( page.dataset.page == 'prev' ) {
				toPage = pC - 2;
			} else if ( page.dataset.page == 'next' ) {
				toPage = pC;
			}
		} else {
			toPage = parseInt(page.dataset.page) - 1;
		}
		document.querySelector('input.udata[data-key="from"]').value 
				= toPage * parseInt(document.querySelector('input.udata[data-key="koldoc"]').value) + 1;
		document.getElementById('sendquery').click();		// Send query activate
	};

let dataApply = function (node, data) { // Draw any type of received data node
	if (data.constructor.toString().match(/Array/i)) { // Got list of objects
		data.forEach(dr => { // draw data row
			let sample;		//  = node.querySelector('.rowSample:not(:only-child)');
			node.querySelectorAll('.rowSample').forEach(smpl => {
				if (smpl.closest('.rdata').isSameNode(node)) sample = smpl
			});
			if (!sample) return;
			let rowClone = sample.cloneNode(true);
			rowClone.className = rowClone.className.replace(/rowSample/, 'rowOut');
			dataApply(rowClone, dr);
			node.insertBefore(rowClone, sample);
		});
	} else if (data.constructor.toString().match(/Object/i)) {
		Object.keys(data).forEach(di => {
			node.querySelectorAll(`.rdata[data-var="${di}"]:not(.set)`)
							.forEach(divOut => { dataApply(divOut, data[di]) });
		});
	} else if (node.matches('.rdata[data-var]:not(.set)')) { // Last checking
		if (node.matches('input')) { // Input type depend settings
			if (node.type === 'checkbox') {
				node.checked = data
			} else {
				node.value = data; // Like `text'
			}
		} else if (node.matches('.checker')) {
			if (data) {
				node.className += ' checked';
			}
		} else if (node.matches('a.link')) { // A HREF type depend settings
			if (node.href.match(/^tel/i)) { // Drop any phone formatting
				if (data.match(/^\+/)) {
					data = '+' + data.replace(/\D/g, '');
				} else {
					data = data.replace(/\D/g, '');
				}
			}
			node.href += data;
		} else if ( node.matches('.monthName') && data.match(/^\d{2}\D\d{2}\D\d{4}/) ) {
			let date = data.match(/^(\d{2})\D(\d{2})\D(\d{4})/);
			node.innerText = monthNames[date[2]-1][0];
		} else if (node.matches('[data-owner]')) {
			node.dataset.owner = data;
		} else if (node.matches('img')) {
			node.src = node.src.replace(/\$var/i, data);
		}else {
			node.innerText = data;
		}
		node.className += ' set';
	}
};

let gotData = function (read) { // Draw response onto page
		let display = document.querySelector('.report.body');
		let failure = document.querySelector('.report.fail');

		// Prepare to display failure or success data
		display.className = display.className.replace(/\s*hidden/g, '');
		failure.className = failure.className.replace(/\s*hidden/g, '');
		if (read.quantity > 0) {
			failure.className += ' hidden';
			let range = formData.from +'&#8212;'+ (formData.from + read[display.dataset.var].length - 1);
			setCookie('period', JSON.stringify({'begin':formData.begin, 'end':formData.end}),
								{ 'path':'/', 'domain':location.host,'max-age':60*60*24*365 } );
			document.querySelectorAll('p.result__title').forEach( p =>{
					let shown = p.querySelector('span.shownrec');
					let total = p.querySelector('span.totalrec');
					let unit = p.querySelector('span[data-plural]');
					if (shown) shown.innerHTML = range;
					if (total) total.innerText = read.quantity;
					if (unit) unit.innerText = plural_str(read.quantity, unit.dataset.plural.split(','));
				});

			// Refresh paginator
			document.querySelectorAll('ul.pagination').forEach( pgBox => {
					let total = read.quantity;
					if ( total > read[display.dataset.var].length ) {
						let pQ = Math.ceil(total/formData.koldoc);		// pagesQuantity
						let pC = Math.ceil( formData.from/formData.koldoc);				// pageCurrent
						let pM = Math.ceil(pQ/2);								// Middle pages

						let pgShow = {'start':1, 'middle':[pM-1, pM, pM+1], 'end':pQ };			// Pages gapping parameters
						if ( pC > pgShow.start +2 && pC < pgShow.end -2 ) {
							pgShow.middle = [pC-1, pC, pC+1];
						} else if ( pC === pgShow.start +2 ) {			// Too close from paginators begin
							pgShow.middle = [pC, pC+1, pC+2];
						} else if ( pC === pgShow.end -2 ) {	// Near pagers end
							pgShow.middle = [pC-2, pC-1, pC];
						}		// Pages gapping parameters

						if ( total !== parseInt(pgBox.dataset.qty) ) {
							pgBox.querySelectorAll('li.page-item:not(.skip)')
												.forEach( pg =>{ pg.parentNode.removeChild(pg)});
							for ( let nP=1; nP <= pQ; nP++ ) {
								let page = createObj('li',{'className':'page-item','innerText':nP, 'data-page':nP,
														'onclick': pageSwitch,});
								pgBox.insertBefore( page, pgBox.lastElementChild );
								if ( (nP === pgShow.start +1) || (nP === pgShow.end -2) ) {
									pgBox.insertBefore( 
										createObj('li',{'className':'page-item','data-page':'space',
														'innerText':'...', 'style.display':'none'})
										, pgBox.lastElementChild);		// Draw page gap
								}
							}
							pgBox.dataset.qty = total;
						} else {
							pgBox.querySelectorAll('li.page-item.active')
												.forEach( pg =>{ pg.className = pg.className.replace(/\s*active/g, '') });
						}

						// Maximum pages need: 1 spacer + 2 start + 2 end + middle length
						if ( pQ > pgShow.middle.length + 4 ) {
							pgBox.querySelectorAll('li.page-item').forEach( pg =>{ 
									pg.removeAttribute('style');
									let nP = parseInt(pg.dataset.page);
									// Two IFs instead One OR for readability reason used here:
									if ( nP > pgShow.start +1 && nP < pgShow.middle[0] ) {
										pg.style.display = 'none'
									} else if ( nP > pgShow.middle.last()
												// See Array.prototype.last in support.js 
												&& nP < pgShow.end -1 ) {
										pg.style.display = 'none'
									}
								});			// Shift page navigation gaps, leave two from begin/end
						}
						let spacers = pgBox.querySelectorAll('li.page-item[data-page="space"]');
						if ( spacers ) {		// Reset page gapping
							if ( pgShow.start +2 >= pgShow.middle[0] ) {
								spacers[0].style.display = 'none';
							}
							if ( pgShow.middle.last() +2 >= pgShow.end ) {
								spacers[spacers.length -1].style.display = 'none';
							}
						}

						pgBox.querySelector('li.page-item[data-page="'+pC+'"]').className += ' active';
						pgBox.firstElementChild.className = pgBox.firstElementChild.className.replace(/\s*active/g, '');
						pgBox.lastElementChild.className = pgBox.lastElementChild.className.replace(/\s*active/g, '');
						if ( pC === 1 ) {
							pgBox.firstElementChild.className += ' active';		// Disable previous/next arrows
						} else if ( pC === pQ ) {
							pgBox.lastElementChild.className += ' active';
						}
						
						pgBox.style.visibility = 'visible';
					} else {
						pgBox.style.visibility = 'hidden';
					}
				});		// Refresh paginator

		} else {
			display.className += ' hidden';
			let period = [];
			[formData.begin, formData.end].forEach(dv => {
												if (!dv) return;
												if ( dv.match(/^\d{8}$/)) {
													dv = dv.replace(/^(\d{4})(\d{2})(\d{2})$/,'$3.$2.$1');
												}
												period.push(dv);
											});
			failure.querySelectorAll('span').forEach(sp => {
				sp.innerText = period.shift()
			});
		} // Prepare showplaces

		// Previous months selector/switcher
		document.querySelectorAll('.other-sort.month').forEach( mCount =>{
				let dateStr = document.querySelector('input.udata[data-key="begin"]').value;
				dateStr = dateStr.replace(/^(\d{2})\D(\d{2})\D(\d{4})$/, '$3-$2-$1');	// Some fixes before process as Date
				let dBegin = new Date(dateStr);
				let [ yBegin, mBegin ] = [ dBegin.getFullYear(), dBegin.getMonth() ];
				for ( let nM = mCount.children.length; nM > 0; nM-- ) {
					mBegin--;
					if ( mBegin < 0 ) { 
						mBegin = 11;
						yBegin--;
					}
					let idx = mCount.children.length - nM;
					mCount.children[idx].innerText = monthNames[mBegin][0]; 	// See const monthNames at support.js
					mCount.children[idx].dataset.begin = `${yBegin}-${leadZero(mBegin+1)}-01`;
																		// Usage of getLastDayOfMonth() see at support.js
					mCount.children[idx].dataset.end = `${yBegin}-${leadZero(mBegin+1)}-${getLastDayOfMonth(yBegin, mBegin)}`;
					mCount.children[idx].title = `${yBegin} г.`;
				}
			});			// Previous months


		// Cleanup display
		display.querySelectorAll('.rowOut')
			.forEach(r => { // Cleanup top level container
				if (r.parentNode.isSameNode(display)) display.removeChild(r)
			});

		// Update list table
		if ( read[display.dataset.var] ) {
			dataApply(display, read[display.dataset.var]); // Now draw a table!
		} // Got suitable list?
		
		display.querySelectorAll('.tab-open').forEach( dt =>{ dt.onclick = infoTabSwitch });	
		display.querySelectorAll('[data-sort]').forEach( sp =>{ sp.onclick = funcSort });
		moneyFormat(display);
		storageDynamic(display);		// Assign hrefs to /media/storage
	}; // gotData END
	
let valXtract = function(div) {			// Extract value of node[data-var] for sorting/filtering
		if ( div.matches('.checker') ) {
			return div.matches('.checked') ? 1 : 0;
		} else if ( div.textContent.replace(/\s/g,'').match(/^\d+$/) )  {
			return parseInt(div.textContent.replace(/\s/g,''));		// Means Number
		} else {
			return div.textContent.trim().toLowerCase();		// For text case ignore
		}
	};

//Function Sort
let funcSort = function (evt) {
	let host = evt.target;
	let box = host.closest('.sort-box');
	if ( !box) box = document;
	let ord = 'asc';
	let active = '';

	if (host.matches('.active')) {
		if (host.matches('.asc')) {
			ord = 'dsc';
		} else {
			ord = 'asc';
		}
	} else {
		box.querySelectorAll('[data-sort]').forEach(ds => {
					ds.className = ds.className.replace(/\s*\b(active|[ad]sc)\b/g, '')
				});
		active = 'active';
		ord = 'asc';
	}
	host.className = host.className.replace(/\s+\b[ad]sc\b/g, '');
	host.className += ` ${active} ${ord}`;
	host.ord = ord;

	if ( box.dataset.target ) {			// Sorts DOM elements of onload rendered data
		let rows = box.parentNode.querySelectorAll(`${box.dataset.target} >.rowOut`);	// Must have that class!
		if ( rows) {
			let zone = rows[0].parentNode;
			let toSort = [];
			for (let i = 0; i < rows.length; i++) {			// Remove rows to array for sorting
				toSort.push( zone.removeChild( rows[i]));
			}

			toSort.sort( (a, b) =>{ 				// Sort array like dataCache.readCache()
									let ret = 0;
									let cA = a.querySelector(`.rdata[data-var="${host.dataset.sort}"]`);	// Must have!
									let cB = b.querySelector(`.rdata[data-var="${host.dataset.sort}"]`);
									let [valA, valB] = [0, 0];
									if ( cA && cB ) {			// Have to compare?
										[valA, valB] = [valXtract( cA), valXtract( cB)];
									}
									if ( valA === valB ) return ret;
									if ( typeof(valA) === 'number' 
											&& typeof(valB) === 'number' ) {		// FCK JS sort() compares strings!
										ret = valA - valB
									} else {
										let cmp = [valA, valB].sort()[0];
										if ( cmp === valA ) {
											ret = -1;
										} else if ( cmp === valB ) {
											ret = 1;
										}
									}
									return ret;
								});
			if ( host.matches('.dsc') ) toSort.reverse();
			toSort.forEach( rw =>{ zone.appendChild(rw)});
		} else {
			console.log('Ошибка структуры DOM. Строки .rowOut не обнаружены');
		}

	} else {			// Let dataCache.display to sort it
		dataCache.display();
	}
};

let storageStatic = function(box) {				// Markup document links on static page
		if ( !box ) box = document.querySelector('.content_body');
		let dater = box.querySelector('[data-begin][data-end]:not(.month)');
		if ( dater ) {
			// Assumed two of date formats: YYYY-MM-DD or DD-MM-YYYY
			let begin = dater.dataset.begin.replace(/^(\d{2})\D(\d{2})\D(\d{4})$/, '$3$2$1');
			let end = dater.dataset.end.replace(/^(\d{2})\D(\d{2})\D(\d{4})$/, '$3$2$1');
			begin = begin.replace(/^(\d{4})\D(\d{2})\D(\d{2})$/, '$1$2$3');
			end = end.replace(/^(\d{4})\D(\d{2})\D(\d{2})$/, '$1$2$3');
			box.querySelectorAll('a.storage').forEach( ah =>{
					let href = ah.href.split('/').last();
					let host = ah.closest('[data-owner]');
					if (host) ah.href = `/media/storage/${begin}/${end}/${host.dataset.owner}/${href}`;
				});
		}
	};

let storageDynamic = function(box) {		// Markup document links after data displayed
		if ( !box ) box = document.querySelector('.report.body');
		box.querySelectorAll('.rowOut >a.storage').forEach( ah =>{
				let host = ah.closest('[data-owner]');
				let href = '';
				ah.querySelectorAll('span.set[data-var]').forEach( sp =>{ href += `${sp.innerText.trim()}.` });
				href = href.replace(/\.$/g,'');
				if (host) ah.href = `/media/storage/${formData.begin}/${formData.end}/${host.dataset.owner}/${href}`;
			});
	};

document.addEventListener('DOMContentLoaded', function () {

	// Some job preparation
	document.querySelectorAll('.other-sort.month .month').forEach( mn =>{ mn.onclick = monthSwitch });
	document.querySelectorAll('ul.pagination li.page-item').forEach( pg =>{ pg.onclick = pageSwitch});
	document.querySelectorAll('span.head-cleaning')
					.forEach( sp =>{ 
							sp.onclick = function() {
											document.querySelectorAll('input[data-filter]').forEach( fi =>{ fi.value = ''});
											dataCache.display();
										} 
									});
	storageStatic();
	document.querySelectorAll('*:not(.rowSample) [data-sort]').forEach( sp =>{ sp.onclick = funcSort });
	let submit = document.getElementById('sendquery');

	if ( submit ) {
		submit.onclick = dataCache.display;
		dataCache.display();
	}			// This template is interactive?
});
