import { Injectable, Signal } from '@angular/core';
import { Product } from '../../models/product.model';
import { CartItem } from 'src/app/models/cartItem.model';
import { signal, computed } from '@angular/core';


function signalBC<T>(channelName: string, initialValue?: T): Signal<T|undefined> {
  const state = signal<T|undefined>(undefined);
  let initDone = false;

  const bc = new BroadcastChannel(channelName);
  console.log('[signalBC] creating BC with name', channelName);

  bc.addEventListener('message', (event) => {
    console.log('[signalBC] message received', event)
    if (event.data.type === 'init') {
      console.log('[signalBC] message received: init');
      if (!initDone) {
        initDone = true;
        console.log('cart, message received => state update', state())
        state.set(event.data.data);
      }
    } else if (event.data.type === 'updated') {
        console.log('[signalBC] message received: updated');
        state.set(event.data.data);
        console.log('[signalBC] message received: updated => state', state());
    }
  });

  console.log('[signalBC] dispatching "subscribe" to subscribe to /cart channel');
  bc.postMessage({ type: 'subscribe' });

  return state.asReadonly();
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  /// cartItems: CartItem[] = [];
  //cartUpdated = signal(false);

  /*
           state consumer              BROADCAST CHANNEL /cart                 state owner
           --------------                                                    --------------
        (1)  broadcast "subcribed"     ---------------------->
        (2)  initializes the state     <----------------------      broadcast "init" (initial state)
        (3)  updates the state         <----------------------      broadcast "updated" (state changes)
        (4)  close channel (optional)  ----XXXXXXX


    */

    // on initialization
    // - broadcast a message to inform the state owner (cart) of a new client
    // - wait for a "init" message that will inform us of the current / initial state
    // - wait for "updated" messages that will inform us of further state changes


  private cartItems: Signal<CartItem[]|undefined> = signalBC('/cart');

  

  constructor() {
    //this.loadCart();
  }

  // private loadCart(): void {
    
   

  //   this.bc.addEventListener('message', (event) => {
  //     if (event.type === ''){
  //       cartItems = event.data;
  //     }
  //   });
  //   this.bc.postMessage({ type: 'get_cart' });
  // }

  // from product list -> shopping cart
  addToCart(product: Product): void {
    const bc = new BroadcastChannel("/cart");
    console.log('[analog CartService] broadcasting "add_to_cart" to /cart channel', product);
    bc.postMessage({ type: 'add_to_cart', product });
  }

  totalItems = computed(() => (this.cartItems() ?? []).reduce((total, item) => total + item.quantity, 0));

  // from shopping cart -> product list
  // getTotalItems(): number {
    //todo computed
    // return 0;
  // }

  // // Get current cart
  // getCart(): CartItem[] {
  //   return this.cartItems;
  // }

  // getTotalAmount(): number {
  //   return this.cartItems.reduce((total, item) => total + item.product.price * item.quantity, 0);
  // }

  // private saveCart(): void {
  //   if (typeof window !== 'undefined' && window.localStorage) {
  //     localStorage.setItem('shoppingCart', JSON.stringify(this.cartItems));
  //   }
  // }

  // private loadCart(): void {
  //   if (typeof window !== 'undefined' && window.localStorage) {
  //     const savedCart = localStorage.getItem('shoppingCart');
  //     if (savedCart) {
  //       try {
  //         this.cartItems = JSON.parse(savedCart);
  //       } catch (error) {
  //         console.error('Failed to parse cart from localStorage:', error);
  //         this.cartItems = [];
  //       }
  //     }
  //   } else {
  //     this.cartItems = [];
  //   }
  // }
}
