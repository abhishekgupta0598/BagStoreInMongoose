const express = require("express");
const {asyncHandler} = require("../common/async");
const Cart = require("../models/carts");
const Product = require("../models/products");
const router = express();
const uuid = require('uuid');
const Order = require("../models/orders");
const UserOrders = require("../models/userorders");
const { BadRequestError } = require("../common/errors");
const UserStats = require("../models/userstats");
const UserAudit = require("../models/useraudit");

router.use(express.json());

router.get("/", asyncHandler(async(req, res) => {
  return {'cart': await Cart.findByUsername(req.user.username)};
}));

router.post("/items/add", asyncHandler(async(req, res) => {
  const cart = await Cart.findByUsername(req.user.username);
  const product = await Product.getProduct(req.body.productCode);
  const itemMatches = cart.items.filter(item => item.productCode == product.productCode);
  let item = null;
  const quantity = req.body.quantity || 1;
  if (itemMatches.length > 0) {
    item = itemMatches[0];
  } else {
    item = {...product, quantity: 0};
    cart.items.push(item);
  }
  item.quantity += quantity;
  await Cart.save(req.user.username, cart);
  return {cart};
}));

router.post("/items/remove", asyncHandler(async(req, res) => {
  const cart = await Cart.findByUsername(req.user.username);
  const product = await Product.getProduct(req.body.productCode);
  const itemMatches = cart.items.filter(item => item.productCode == product.productCode);
  let item = null;
  if (itemMatches.length > 0) {
    item = itemMatches[0];
  } else {
    item = {...product, quantity: 0};
    cart.items.push(item);
  }
  const quantity = req.body.quantity || 1;
  if (item.quantity > quantity) {
    item.quantity = 0;
  } else {
    item.quantity -= quantity
  }
  if (item.quantity == 0) {
    cart.items = cart.items.filter(item => item.quantity != 0);
  }
  await Cart.save(req.user.username, cart);
  return {cart};
}));

router.post("/checkout", asyncHandler(async(req) => {
  const cart = await Cart.findByUsername(req.user.username);
  if (cart.items.length == 0) {
    throw new BadRequestError('Cannot checkout an empty cart!');
  }
  let orderId = uuid.v4();
  while (Order.orderExists(orderId)) {
    orderId = uuid.v4();
  }
  const order = {...cart, id: orderId, status: Order.STATUS_PENDING_PAYMENT};
  const userOrders = await UserOrders.get(req.user.username, orderId);
  userOrders.orders.push(orderId);

  // TODO: Make these two transactional.
  await Order.save(order);
  await UserOrders.save(req.user.username, orderId, userOrders);
  await Cart.clearCart(req.user.username);

  // TODO: validate availability and price of each item in the cart.

  const total = 0;
  for (const item of cart.items) {
    total += item.quantity * item.price;
  }
  const userStats = await UserStats.get(req.user.username);
  userStats.balance += total;
  await UserStats.save(req.user.username, userStats);
  await UserAudit.add(req.user.username, `User balance updated by ${total} to ${userStats.balance} because of order ${orderId}.`)

  return {};
}));


module.exports = router;