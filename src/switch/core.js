/*!
 * module  switch
 * author  Kael Zhang
 */
 
/**
 life cycle --------->  Switch  <--------- event interface
                        ^   ^ 
                        |   |
                        |   |
 plugin host -----------|   |-------- prototype inheritance: 
                                      only allowed for methods about life cycle
 */
 
KM.define(['./conf', 'util/queue'], function(K, require){

var EVENT_BEFORE_INIT = 'beforeInit',
    EVENT_AFTER_INIT = 'afterInit',
    EVENT_BEFORE_SWITCH = 'beforeSwitch',
    EVENT_ON_SWITCH = 'switching',
    EVENT_COMPLETE_SWITCH = 'completeSwitch',
    EVENT_NAV_ENABLE = 'navEnable',
    EVENT_NAV_DISABLE = 'navDisable',

    NOOP = function(){},
    EMPTY = '',
    
    PREV = 'prev',
    NEXT = 'next',

    Switch,
    Class = K.Class,
    
    // MultiEvent = require('event/multi'),
    Queue = require('util/queue'),
    SwitchConfig = require('./conf');
    

function limit(num, min, max){
	return Math.min(max, Math.max(min, num));
};

function atLeastOne(num){
	return !num || num < 1 ? 1 : num;
};


/**
 * move or add the class of triggers
 */
function currentTriggerClass(remove, index){
    var self = this,
    	currentTrigger = self.triggers[index || self.activePage],
        TRIGGER_ON_CLS = self.get('triggerOnCls');
        
    currentTrigger && (
    remove ? 
    	currentTrigger.removeClass(TRIGGER_ON_CLS) : 
    	currentTrigger.addClass(TRIGGER_ON_CLS)
    );
};

/**
 * @constructor
 *
 * @usage 
 <code>
 	new Switch().plugin('lazyLoad', 'autoPlay'[, ...]).init(options);
 </code>
 
 * if no plugin is specified, the items will plainly switched with no effect
 */
Switch = Class({
    Implements: 'attrs events',
    
    initialize: function(){
    	var self = this,
    		bind = K.bind;
    		
    	self.setAttrs();
    	
    	// bind public methods
    	bind('prev', self);
    	bind('next', self);
    	bind('plugin', self);
    	bind('init', self);
    	
    	// initialization queue for dynamicly loading plugins
    	self._initializer = new Queue.Converter([
    		{
	    		method: 'plugin',
	    		
	    		// asychronously loading more plugins
	    		auto: false,
	    		
	    		// after initialization, registering new plugin is forbidden
	    		before: 'init'
	    	}, {
	    		method: 'init',
	    		
	    		// method init should be executed only once
	    		once: true
	    	},
	    	
	    	'switchTo', 'prev', 'next'
    	], self ).on();
    	
    	K._onceBefore('_runLC', '_initLC', self);
    },

    // @private
    // store the instance of plugin
    _plugins: [],

    // store the name of the plugins for indexing
    _plugin_names: [],
	
	/**
	 * Life Cycle
	 * key feature of switch module
	 * to extend the Switch Class into a much more complex switcher,
	 * you could override this setting, according to the api of util/queue
	 
	 * syntax:
	 * Array.<item>
	 * item
	 	{string} method name to be execute by sequence
	 	{Object} queue object
	 		{
	 			auto: 	{boolean}, default to true
	 			once: 	{boolean}, default to false
	 			method: {function()|string}
	 			args: 	{Array} arguments
	 		}
	 */
	_lifeCycle: ['_before', '_on', '_after'],
	
	
	/**
	 * filter plugins to get the ones which need to be provided
	 * @param {Array.<string, Object>} plugins
	 */
	_pendingPlugins: function(plugins){
		var self = this,
			plugin, 
			i = 0, 
			len = plugins.length,
			pending_plugins = [],
			pending_indexs = [],
			
			// switch configuration getter
			config = SwitchConfig;
			
		for(; i < len; i ++){
			plugin = plugins[i];
			
			if(K.isString(plugin)){
				pending_plugins.push(config.modName(plugin));
				pending_indexs.push(i);
			}
		}
		
		// before executing ._addPlugin, make sure every plugin is provided
		K.provide(pending_plugins, function(){
			var provided = K.makeArray(arguments),
				_plugins = plugins;
			
			// shift KM
			provided.shift();
			
			pending_indexs.forEach(function(index, i){
				_plugins[index] = provided[i];
			});
			
			self._plugin.apply(self, _plugins);
			_plugins.length = pending_plugins.length 
							= pending_indexs.length
							= 0;
			
			self._initializer.resume();
		});
		
		return self;
	},
	
	/**
	 * attach a plugin or plugins to the switch instance
	 * .plugin might be an asynchronous method which will be added to the end of the pending queue of Initializer
	 
	 * @public
	 * @param {string|Object} arguments
	 */
	plugin: function(){
    	return this._pendingPlugins(arguments);
	},
	
	// register plugins
    // @param {object} arguments plugin object
    _plugin: function(){
        if(!this.pluginFinal){
            var i = 0,
                len = arguments.length,
                plugin,
                self = this,
                config = SwitchConfig;

            for(; i < len; ++ i){
                plugin = arguments[i]; 

                if(!plugin){
                    continue;
                }

                // add plugin,
                // and if it's final, exit for-loop
                if( self._addOnePlugin(plugin) ){
                    break;
                }
            }

        }
    },
	
	/**
	 * @param {Object} plugin
	 * @return {boolean} whether is the a plugin
	 */
	_addOnePlugin: function(plugin){
		var self = this;

        // you can add a plugin only once
        if(!plugin || !plugin.name || self._plugin_names.indexOf(plugin.name) !== -1 || self.pluginFinal){
            return;
        }
		
		// removed: dependency detection will be assigned to loader
        // X if has required plugin, register that plugin first
        // if(plugin.require && arguments.callee(D.Switch.Plugins[_plugin.require]) ){
        //    return t.pluginFinal = true;
        // }

        // set plugin attributes before method Switch.init, so that we can override plugin options before plugin.init
        K.each(plugin.ATTRS, function(setting, key){
        	var undef, value;
        	
        	this.addAttr(key, setting);
        	setting && (value = setting.value) !== undef && this.set(key, value);
        }, self);
        
        self._plugins.push(plugin);
        self._plugin_names.push(plugin.name);
        
        return plugin.final_ ? (self.pluginFinal = true) : false;
	},

   	// initialization of Switch and Switch plugins
    // @param options {object} DP.Switch options and DP.Switch.Plugins options
    init: function(options){
        var self = this,
            o,
            currentItem, 
            activePage,
            plugins = self._plugins;

		self._initializer.off();
		self.nav = {};
		
		// apply plugin initialization method
        plugins.forEach(function(plugin){
            if(plugin.init){
                plugin.init(self);
            }
        });
		
		// some essential data should be initialized ahead
		['CSPre', 'containerCS', 'activePage', 'triggerType'].forEach(function(key){
			var setting = options[key];
			
			self.set(key, setting || '');
			delete options[key];
		});
		
		self.fire(EVENT_BEFORE_INIT);
        self.set(options);
          
        if(self.container){
            self._itemData();
            self.fire(EVENT_AFTER_INIT);
            
            activePage = self.activePage;
            currentItem = self._getItem(activePage);

            if(currentItem && !currentItem.hasClass(self.get('itemOnCls'))){
                self.switchTo(self.activePage, true);
            }
        }

        return self;
    },

	_itemData: function(length){
		var self = this;
	
		self.length = length || self.items.length;
		
		/**
         calculate how many pages the Switcher has:
         
         //////////////////////////////////////////////////////////////////////////////////////
         
                                      |         length          |
                                      | stage |
                                      _________
         begin                        ___________________________ <-- move to left
         end      ___________________________
                  | move * (page - 1) |  L  |
		
		 //////////////////////////////////////////////////////////////////////////////////////

         1. move * (page - 1) + L = length    // size
         2. 0 < L <= stage                    // 
         3. 0 <= stage - L < move             // no exceed
         
         // common sense: each move should be less than the length of stage 
         // otherwise, some pics will be invisible
         4. stage >= move
                             
         so, page?
         -> 1 + (length - stage)/move <= page < 2 + (length - stage)/move
         -> page = {1 + (length - stage)/move}
        */
        self.pages = 1 + Math.ceil( (self.length - self.get('stage')) / self.get('move') );
	},

    /**
     * switch to a certain item
     * @param {number} index the index of the item to be switched on
     * @param {boolean} force force to switching
     */
    switchTo: function(index, force){
        var self = this;
        
        self.force = force;
        self.expectPage = index;
        
        self._runLC();

        return self;
    },
    
    /**
     * go to the previous position
     */
    prev: function(e){
        e && e.prevent();
        var self = this;
		
		self.fire(PREV);
		
        // limit the range of activePage
        !self.noprev && self.switchTo( self._limit(self.activePage - 1) );
        
        return self;
    },
	
	/**
     * go to the next position
     */
    next: function(e){
        e && e.prevent();
        var self = this;
		
		self.fire(NEXT);
        !self.nonext && self.switchTo( self._limit(self.activePage + 1) );
        
        return self;
    },
    
    /**
     * run life cycle
     */
    _runLC: function(){
    	this._lifeCycle.run();
    },
    
    /**
     * initialize life cycle
     * @onceBefore _runLC
     */
    _initLC: function(){
    
    	// processing queue for switch life cycle
    	this._lifeCycle = new Queue.Runner(this._lifeCycle, this);
    },
    
    //////// life cycle start ///////////////////////////////////////////////////////////////////////////////
    _before: function(){
    	var self = this, index = self.expectPage;
    	
    	if(self.force || self.activePage !== index){
    		self.fire(EVENT_BEFORE_SWITCH, [self.activePage, index]);
    	}else{
    		self._lifeCycle.stop();
    	}
    },
    
    _on: function(){
    	this.fire(EVENT_ON_SWITCH);
    },
    
    _after: function(){
    	var counters = this.pageCounters;
    	
    	counters && counters.text(this.activePage + 1);
    },
    //////// life cycle end ///////////////////////////////////////////////////////////////////////////////
  	
  	
  	/**
  	 * method to get items
  	 */
  	_getItem: function(index){
  		return this.items[index];
  	},
  
  	/**
  	 * @private
  	 --------------------------------------------------------------------------------------------------- */
  	_onEnterTrigger: function(index){
        this.triggerOn = true;
    },

    _onLeaveTrigger: function(index){
        this.triggerOn = false;
    },

    // disable or enable navigation buttons
 
 	// TODO:
 	// use event instead
    _dealNavs: function(){
        var self = this;
        
        self._dealNav('prev');
        self._dealNav('next');
    },
    
    _dealNav: function(type){
    	var self = this, nav = self.nav[type], isEnd;
    
    	if(nav){
    		isEnd = self['_isNo' + type]();
    		
    		self.fire((isEnd ? EVENT_NAV_DISABLE : EVENT_NAV_ENABLE), [nav, type]);
    	}
    },
    
    /**
     * do nothing by default
     */
    _dealTriggerCls: NOOP,
    
    
    ////////////////////////////////////////////////////////////////////////////////
    // methods for overriding
    ////////////////////////////////////////////////////////////////////////////////
    
    /**
     * method to limit the given index
     */
    _limit: function(index){
    	return limit(index, 0, this.pages - 1);
    },
    
    /**
	 * method to check the number of pages to determine whether the Switch instance meet either of the 2 ends
	 * which could be overridden for infinite carousel and step loading
	 */
    _isNoprev: function(){
    	var self = this;
    
    	return self.noprev = !self.activePage;
    },
    
    _isNonext: function(){
    	var self = this;
    	
    	return self.nonext = (self.activePage >= self.pages - 1);
    }
});


Class.setAttrs(Switch, {

	// stage {int} the number of items in one viewport
	stage: {
		value: 1,
		setter: atLeastOne
	},
	
	// move {int} the number of items a single switch will move
	move: {
		value: 1,
		setter: atLeastOne
	},
	
	triggerType: {
		value: 'click',
		validator: function(v){
			return !!v;
		}
	},
	
	// CSPre {string} prefix of selectors
	// if CSPre === '#switch', then we will get previous button with $$('#switch ' + options.prev)[0]
	CSPre: {
		writeOnce: true,
		setter: function(v){
			this.CSPre = v + ' ';
		}
	},
	
	// triggerCS {string} trigger selector of switch tabs, such as 1,2,3,4
	triggerCS: {
		setter: function(v){
			var self = this,
				type = self.get('triggerType');
				
			self.triggers = $.all(self.CSPre + v).el().map(function(trigger, index){
	        	var t = self;
	        
	        	return $(trigger)
	        		.on(type, function(e){
		                e && e.prevent();
		                t.switchTo(index);
		
		            }).on({
		                mouseenter: function(){ t._onEnterTrigger(index); },
		                mouseleave: function(){ t._onLeaveTrigger(index); }
		            });
	        });
	        
	        self._dealTriggerCls = currentTriggerClass;
		}
	},
	 		
	triggerOnCls: {
		value: EMPTY
	},
	
	countCS: {
		setter: function(v){
			this.pageCounters = $.all(this.CSPre + v);
		}
	},
	
	// container, prev, next {string} 
	containerCS: {
		setter: function(v){
			this.container = $(this.CSPre + v);
		}
	},
	
	prevCS: {
		setter: function(v){
			var self = this, PREV = 'prev';
			
			self.nav[PREV] = $.all(self.CSPre + v).on(self.get('triggerType'), self[PREV]);
		}
	},
	
	nextCS: {
		setter: function(v){
			var self = this, NEXT = 'next';
			
			self.nav[NEXT] = $.all(self.CSPre + v).on(self.get('triggerType'), self[NEXT]);
		}
	},
	
	// items will be fetched by container.getElements()
	itemCS: {
		setter: function(v){
			var self = this;
			
			self.items = self.container.all(v).el().map(function(el){
				return $(el);
			});
		}
	},
	
	itemOnCls: {
		value: EMPTY
	},
	
	// the index of the first items activated when initializing
	activePage: {
		value: 0,
		setter: function(v){
			this.activePage = !v || v < 0 ? 0 : v;
		}
	},
	
	EVENTS: {
		readOnly: true,
		getter: function(){
			return this.constructor.EVENTS;
		}
	}
});


Switch.EVENTS = {
	BEFORE_INIT		: EVENT_BEFORE_INIT,
    AFTER_INIT		: EVENT_AFTER_INIT,
    BEFORE_SWITCH	: EVENT_BEFORE_SWITCH,
    ON_SWITCH		: EVENT_ON_SWITCH,
    COMPLETE_SWITCH	: EVENT_COMPLETE_SWITCH,
    NAV_DISABLE		: EVENT_NAV_DISABLE,
    NAV_ENABLE		: EVENT_NAV_ENABLE,
    PREV			: PREV,
    NEXT			: NEXT
};


return Switch;

});

/**
 change log:
 
 2011-11-15  Kael:
 - lazily initialize the controller of lifeCycle, so that plugins could be involved in.
 
 TODO:
 A. refractor lifeCycle with interrupt action
 
 2011-10-25  Kael:
 - migrate to Neuron
 - switch/core will no longer deal with disable style of navigation buttons
 
 TODO:
 A. refractor: split the logic about on-switching effects, so we could accomplish random switcher
 
 2011-08-15  Kael:
 
 TODO:
 A. add method .addItem .addTrigger
 B. [issue] when there's only one page, the status of prev button is incorrect
 C. add plugin cfg support for configuring the base paths of modules
 
 2011-08-11  Kael:
 - add support to multiple prev and next button
 - split several methods, add ._itemData, ._isLeftEnd, ._isRightEnd
 
 2011-08-10  Kael:
 - TODO[08.09].[B,D]
 
 2011-08-09  Kael:
 - complete the whole life cycle
 
 TODO:
 A. add multi-event support
 √ B. add event interface of onActive and onDeactive
 C. dom santitizer for all plugins
 √ D. manage all event method and names of switch core and plugins
 
 2011-08-08  Kael:
 - complete ASQueue.Converter and ASQueue.Runner. TODO[08-07].A
 
 2011-08-07  Kael:
 TODO:
 √ A. ASQ	
 		ASQueue::convert, method to convert the exist methods as ASQueue methods
 		ASQueue::run, method to run a specific list of methods
 
 2011-08-05  Kael:
 - migrate all of the current plugins to loader
 - add Initializer (instead of TODO[08.01].[A,B])
 	1. which can dynamically load dependencies and plugins
 	2. is a pending queue for async and sync methods
 - enhance the stability of the lazy-load plugin

 2011-08-01  Kael:
 - migrate to loader
 
 TODO:
 √ A. plugin host, a instance of loader
 √ B. hirachical plugin
 C. split methods of utilities
 D. if the 'before' property is defined, the method will be emptied after the terminator executed
 E. Initializer: allow parallelly executing many methods of the same type
 F. deal with the letter case of plugin names
 
 2010-02-23  Kael:
 - 处理activePage属性的一个问题，将其的初始化从插件里移动到本体中进行
 - 优化了plugin的调用链，优化部分性能
 - 加入autoplay
 - 修正本体中，一个计算分页值的算法错误
 
 2010-01-05  Kael:
 - 修正一个nextBtn没有正确禁用的问题
 
 2009-10-20  Kael:
 - 主体方法
 */